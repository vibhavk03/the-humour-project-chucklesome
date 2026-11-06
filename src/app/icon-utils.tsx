import { ImageResponse } from "next/og";

type IconPalette = {
  bgStart: string;
  bgEnd: string;
  bubble: string;
  ink: string;
  label: string;
  tag: null | {
    text: string;
    background: string;
    color: string;
  };
};

const getDeploymentEnv = () => {
  if (typeof process === "undefined") {
    return "development";
  }

  return (
    process.env.NEXT_PUBLIC_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_APP_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
};

const getPalette = (): IconPalette => {
  const deploymentEnv = getDeploymentEnv();
  const isProd = deploymentEnv.toLowerCase() === "production";

  if (isProd) {
    return {
      bgStart: "#ef4444",
      bgEnd: "#b91c1c",
      bubble: "#f8fafc",
      ink: "#0f172a",
      label: "#b91c1c",
      tag: null,
    };
  }

  return {
    bgStart: "#386ee0",
    bgEnd: "#18419a",
    bubble: "#f8fafc",
    ink: "#0f172a",
    label: "#18419a",
    tag: {
      text: "DEV",
      background: "#0f172a",
      color: "#f8fafc",
    },
  };
};

export const renderIcon = (size: number) => {
  const palette = getPalette();
  const scale = size / 64;
  const px = (value: number) => value * scale;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${palette.bgStart}, ${palette.bgEnd})`,
          borderRadius: px(16),
          fontFamily:
            '"Space Grotesk", "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif',
          position: "relative",
        }}
      >
        <div
          style={{
            position: "relative",
            width: px(46),
            height: px(50),
            display: "flex",
            transform: "rotate(-6deg)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: palette.bubble,
              borderRadius: px(22),
              border: `${px(2)}px solid ${palette.ink}`,
              boxShadow: `${px(3)}px ${px(4)}px 0 ${palette.ink}20`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: px(8),
              left: px(6),
              right: px(6),
              height: px(6),
              background: palette.ink,
              opacity: 0.12,
              borderRadius: px(999),
            }}
          />
          <div
            style={{
              position: "absolute",
              top: px(16),
              left: px(12),
              width: px(7),
              height: px(11),
              background: palette.label,
              borderRadius: px(999),
            }}
          />
          <div
            style={{
              position: "absolute",
              top: px(16),
              right: px(12),
              width: px(7),
              height: px(11),
              background: palette.label,
              borderRadius: px(999),
            }}
          />
          <div
            style={{
              position: "absolute",
              top: px(28),
              left: "50%",
              width: px(7),
              height: px(7),
              background: palette.label,
              borderRadius: px(2),
              transform: "translateX(-50%) rotate(45deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: px(9),
              left: "50%",
              width: px(24),
              height: px(12),
              border: `${px(3)}px solid ${palette.label}`,
              borderTop: "0px",
              borderRadius: px(999),
              transform: "translateX(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: px(7),
              left: "50%",
              width: px(28),
              height: px(10),
              border: `${px(2)}px solid ${palette.label}`,
              borderTop: "0px",
              borderRadius: px(999),
              transform: "translateX(-50%)",
              opacity: 0.35,
            }}
          />
        </div>
        {palette.tag ? (
          <div
            style={{
              position: "absolute",
              right: px(6),
              top: px(6),
              padding: `${px(2)}px ${px(4)}px`,
              borderRadius: px(6),
              background: palette.tag.background,
              color: palette.tag.color,
              fontSize: px(8),
              fontWeight: 700,
              letterSpacing: px(1),
            }}
          >
            {palette.tag.text}
          </div>
        ) : null}
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
};
