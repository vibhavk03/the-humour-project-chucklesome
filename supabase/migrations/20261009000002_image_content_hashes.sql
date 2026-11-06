BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
-- Verified hashes and upload leases are backend-only. Images keep their IDs,
-- ownership, visibility, and audit fields even when they share an S3 object.
CREATE TABLE public.image_content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_host TEXT NOT NULL CHECK (image_host IN ('images.almostcrackd.ai', 'images.crackd.ai')),
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  stored_sha256 TEXT CHECK (stored_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'uploading', 'ready')),
  storage_key TEXT,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (image_host, source_sha256),
  CHECK (status <> 'ready' OR (stored_sha256 IS NOT NULL AND storage_key IS NOT NULL)),
  CHECK (storage_key IS NULL OR (storage_key !~ '[?#[:space:]]' AND storage_key !~ '^/' AND storage_key !~ '(^|/)\.\.(/|$)'))
);
CREATE INDEX image_content_assets_stored_hash_idx
  ON public.image_content_assets(image_host, stored_sha256) WHERE status = 'ready';
CREATE INDEX image_content_assets_storage_key_idx
  ON public.image_content_assets(image_host, storage_key) WHERE status = 'ready';

CREATE TABLE public.image_content_hashes (
  image_id UUID PRIMARY KEY REFERENCES public.images(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.image_content_assets(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL
);
CREATE INDEX image_content_hashes_asset_idx ON public.image_content_hashes(asset_id);
CREATE INDEX images_content_url_hash_idx ON public.images(md5(url)) WHERE url IS NOT NULL;
ALTER TABLE public.image_content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_content_hashes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.image_content_assets, public.image_content_hashes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.image_content_assets, public.image_content_hashes TO service_role;

CREATE FUNCTION public.claim_image_content_upload(p_image_host TEXT, p_sha256 TEXT)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_asset public.image_content_assets; v_token UUID;
BEGIN
  IF p_image_host NOT IN ('images.almostcrackd.ai', 'images.crackd.ai') OR p_image_host IS NULL
     OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid image hash or environment';
  END IF;
  -- A hosted file's digest also matches when that file is supplied as input.
  SELECT * INTO v_asset FROM public.image_content_assets
    WHERE image_host = p_image_host AND status = 'ready'
      AND (source_sha256 = p_sha256 OR stored_sha256 = p_sha256)
    ORDER BY created_at, id LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('status', 'ready', 'asset', to_jsonb(v_asset)); END IF;
  INSERT INTO public.image_content_assets(image_host, source_sha256, status)
    VALUES(p_image_host, p_sha256, 'pending') ON CONFLICT (image_host, source_sha256) DO NOTHING;
  SELECT * INTO v_asset FROM public.image_content_assets
    WHERE image_host = p_image_host AND source_sha256 = p_sha256 FOR UPDATE;
  IF v_asset.status = 'ready' THEN
    RETURN jsonb_build_object('status', 'ready', 'asset', to_jsonb(v_asset));
  END IF;
  IF v_asset.status = 'uploading' AND v_asset.lease_expires_at > clock_timestamp() THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  v_token := gen_random_uuid();
  UPDATE public.image_content_assets SET status = 'uploading', lease_token = v_token,
    lease_expires_at = clock_timestamp() + interval '3 minutes' WHERE id = v_asset.id
    RETURNING * INTO v_asset;
  RETURN jsonb_build_object('status', 'claimed', 'asset', to_jsonb(v_asset));
END $$;

CREATE FUNCTION public.finish_image_content_upload(p_asset_id UUID, p_lease_token UUID,
  p_storage_key TEXT, p_stored_sha256 TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_asset public.image_content_assets;
BEGIN
  IF p_storage_key IS NULL OR p_storage_key = '' OR p_stored_sha256 IS NULL
     OR p_stored_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid stored image'; END IF;
  UPDATE public.image_content_assets SET status = 'ready', storage_key = p_storage_key,
    stored_sha256 = p_stored_sha256, lease_token = NULL, lease_expires_at = NULL
    WHERE id = p_asset_id AND status = 'uploading' AND lease_token = p_lease_token
      AND lease_expires_at > clock_timestamp()
    RETURNING * INTO v_asset;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Includes existing rows registered by the resumable backfill.
  INSERT INTO public.image_content_hashes(image_id, asset_id, image_url)
    SELECT id, v_asset.id, url FROM public.images
    WHERE md5(url) = md5('https://' || v_asset.image_host || '/' || v_asset.storage_key)
      AND url = 'https://' || v_asset.image_host || '/' || v_asset.storage_key
    ON CONFLICT (image_id) DO UPDATE SET asset_id = EXCLUDED.asset_id, image_url = EXCLUDED.image_url;
  RETURN true;
END $$;

CREATE FUNCTION public.release_image_content_upload(p_asset_id UUID, p_lease_token UUID)
RETURNS VOID LANGUAGE sql SET search_path = public, pg_temp AS $$
  UPDATE public.image_content_assets SET status = 'pending', lease_token = NULL, lease_expires_at = NULL
    WHERE id = p_asset_id AND status = 'uploading' AND lease_token = p_lease_token;
$$;

CREATE FUNCTION public.find_image_content_duplicate(p_image_host TEXT, p_sha256 TEXT,
  p_user_id UUID, p_client_id TEXT, p_is_common_use BOOLEAN)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('id', i.id, 'url', i.url)
  FROM public.image_content_assets content
  JOIN public.image_content_hashes h ON h.asset_id = content.id
  JOIN public.images i ON i.id = h.image_id AND i.url = h.image_url
  WHERE content.image_host = p_image_host AND content.status = 'ready'
    AND content.stored_sha256 IN (
      SELECT a.stored_sha256 FROM public.image_content_assets a
        WHERE a.image_host = p_image_host AND a.status = 'ready'
          AND (a.source_sha256 = p_sha256 OR a.stored_sha256 = p_sha256))
    AND i.url LIKE 'https://' || content.image_host || '/%'
    AND ((p_is_common_use AND i.is_common_use IS TRUE AND i.is_public IS TRUE)
      OR (NOT p_is_common_use AND i.is_common_use IS NOT TRUE AND i.is_public IS NOT TRUE
        AND ((p_user_id IS NOT NULL AND p_client_id IS NULL AND i.profile_id = p_user_id)
          OR (p_client_id IS NOT NULL AND p_user_id IS NULL AND i.created_by_client_id = p_client_id))))
  ORDER BY content.created_at, i.id LIMIT 1;
$$;

CREATE FUNCTION public.find_ready_image_content_asset(p_image_host TEXT, p_sha256 TEXT)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT to_jsonb(a) FROM public.image_content_assets a
    WHERE image_host = p_image_host AND status = 'ready'
      AND (source_sha256 = p_sha256 OR stored_sha256 = p_sha256)
    ORDER BY created_at, id LIMIT 1;
$$;

-- Only hashes computed by the server are attached to image rows. Changing a URL
-- invalidates its old fingerprint; deleting an image cascades its association.
CREATE FUNCTION public.sync_image_content_hashes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_asset_id UUID; v_host TEXT; v_key TEXT;
BEGIN
  v_host := split_part(NEW.url, '/', 3);
  v_key := substring(NEW.url FROM length('https://' || v_host || '/') + 1);
  SELECT id INTO v_asset_id FROM public.image_content_assets
    WHERE status = 'ready' AND image_host = v_host AND storage_key = v_key
      AND NEW.url = 'https://' || image_host || '/' || storage_key
    ORDER BY created_at, id LIMIT 1;
  IF v_asset_id IS NULL THEN
    DELETE FROM public.image_content_hashes WHERE image_id = NEW.id;
  ELSE
    INSERT INTO public.image_content_hashes(image_id, asset_id, image_url)
      VALUES(NEW.id, v_asset_id, NEW.url) ON CONFLICT (image_id)
      DO UPDATE SET asset_id = EXCLUDED.asset_id, image_url = EXCLUDED.image_url;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER images_sync_content_hashes AFTER INSERT OR UPDATE OF url ON public.images
  FOR EACH ROW EXECUTE FUNCTION public.sync_image_content_hashes();

REVOKE ALL ON FUNCTION public.claim_image_content_upload(TEXT,TEXT),
  public.finish_image_content_upload(UUID,UUID,TEXT,TEXT),
  public.release_image_content_upload(UUID,UUID),
  public.find_image_content_duplicate(TEXT,TEXT,UUID,TEXT,BOOLEAN),
  public.find_ready_image_content_asset(TEXT,TEXT),
  public.sync_image_content_hashes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_image_content_upload(TEXT,TEXT),
  public.finish_image_content_upload(UUID,UUID,TEXT,TEXT),
  public.release_image_content_upload(UUID,UUID),
  public.find_image_content_duplicate(TEXT,TEXT,UUID,TEXT,BOOLEAN),
  public.find_ready_image_content_asset(TEXT,TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
