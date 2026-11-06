"use client";

import { useEffect, useState } from "react";
import { AllowedDomainsService, type AllowedDomain } from "@/services/allowed-domains.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AllowedDomainsPage() {
  const { toast } = useToast();
  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = async () => {
    setIsLoading(true);
    const list = await AllowedDomainsService.list();
    setDomains(list);
    setIsLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const onAdd = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setIsAdding(true);
    const ok = await AllowedDomainsService.add(domain);
    if (ok) {
      setNewDomain("");
      void load();
    } else {
      toast({
        title: "Failed to add domain",
        description: "Please check the value and try again.",
        variant: "destructive",
      });
    }
    setIsAdding(false);
  };

  const onRemove = async (id: number) => {
    setDeletingId(id);
    const ok = await AllowedDomainsService.remove(id);
    if (ok) void load();
    else {
      toast({
        title: "Failed to remove domain",
        description: "Please refresh and try again.",
        variant: "destructive",
      });
    }
    setDeletingId(null);
  };

  return (
    <div className="page-shell max-w-2xl">
      <div className="page-header">
        <h1 className="page-title">Domains</h1>
        <p className="page-subtitle">
          Only users with emails from these domains can sign up.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="e.g. example.com"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
        />
        <Button onClick={onAdd} disabled={!newDomain.trim() || isAdding}>
          {isAdding ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Adding
            </span>
          ) : (
            <><Plus className="h-4 w-4 mr-1" /> Add</>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : domains.length === 0 ? (
        <div className="text-sm text-muted-foreground">No domains yet.</div>
      ) : (
        <div className="space-y-2">
          {domains.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-card/80 px-3 py-2"
            >
              <div className="text-sm">{d.apex_domain}</div>
              <Button
                variant="destructive"
                size="sm"
                disabled={deletingId === d.id}
                onClick={() => onRemove(d.id)}
              >
                {deletingId === d.id ? (
                  <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
