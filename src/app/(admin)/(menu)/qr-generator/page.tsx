"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Plus, Edit2, Trash2, QrCode, Copy, ExternalLink, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import QRCode from "qrcode";
import { LinkRedirectsService } from "@/services/link-redirects.service";
import LinkRedirect from "@/types/link-redirect";
import AddLinkRedirectDialog from "@/components/dialog/AddLinkRedirectDialog";
import EditLinkRedirectDialog from "@/components/dialog/EditLinkRedirectDialog";
import DeleteLinkRedirectDialog from "@/components/dialog/DeleteLinkRedirectDialog";

export default function QRGeneratorPage() {
  // Helper function to get the www URL (public site) based on current admin URL
  const getWwwUrl = (): string => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    // If admin.almostcrackd.ai, use www.almostcrackd.ai
    if (origin.includes('admin.almostcrackd.ai')) {
      return 'https://www.almostcrackd.ai';
    }
    // If admin.crackd.ai, use www.crackd.ai
    if (origin.includes('admin.crackd.ai')) {
      return 'https://www.crackd.ai';
    }
    // For local development, default to staging
    return 'https://www.almostcrackd.ai';
  };

  const [url, setUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Links state
  const [links, setLinks] = useState<LinkRedirect[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<LinkRedirect | null>(null);
  const [linkQrCodes, setLinkQrCodes] = useState<Record<number, string>>({});
  const { toast } = useToast();

  const fetchLinks = useCallback(async () => {
    setIsLoadingLinks(true);
    try {
      const data = await LinkRedirectsService.getAll();
      setLinks(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load links",
        variant: "destructive",
      });
    } finally {
      setIsLoadingLinks(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);



  const generateQRCode = async () => {
    if (!url.trim()) return;

    setIsGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (canvas) {
        await QRCode.toCanvas(canvas, url, {
          width: 400,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        });
        const dataUrl = canvas.toDataURL();
        setQrCodeUrl(dataUrl);
      }
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    }
    setIsGenerating(false);
  };

  const downloadQRCode = () => {
    if (!qrCodeUrl) return;

    const link = document.createElement("a");
    link.href = qrCodeUrl;
    link.download = `qr-code-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateLinkQRCode = async (link: LinkRedirect) => {
    const redirectUrl = `${getWwwUrl()}/link/${link.slug}`;
    try {
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, redirectUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      const dataUrl = canvas.toDataURL();
      setLinkQrCodes((prev) => ({ ...prev, [link.id]: dataUrl }));
    } catch (error) {
      console.error("Failed to generate QR code:", error);
      toast({
        title: "Error",
        description: "Failed to generate QR code",
        variant: "destructive",
      });
    }
  };

  const downloadLinkQRCode = (link: LinkRedirect) => {
    const qrCode = linkQrCodes[link.id];
    if (!qrCode) return;

    const linkElement = document.createElement("a");
    linkElement.href = qrCode;
    linkElement.download = `qr-code-${link.slug}-${Date.now()}.png`;
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
  };

  const copyRedirectUrl = (link: LinkRedirect) => {
    const redirectUrl = `${getWwwUrl()}/link/${link.slug}`;
    navigator.clipboard.writeText(redirectUrl);
    toast({
      title: "Copied!",
      description: "Redirect URL copied to clipboard",
    });
  };

  const handleAddSuccess = (newLink: LinkRedirect) => {
    setLinks((prev) => [newLink, ...prev]);
  };

  const handleEditSuccess = (updatedLink: LinkRedirect) => {
    setLinks((prev) =>
      prev.map((link) => (link.id === updatedLink.id ? updatedLink : link))
    );
    // Clear QR code if slug changed
    if (selectedLink && selectedLink.slug !== updatedLink.slug) {
      setLinkQrCodes((prev) => {
        const newCodes = { ...prev };
        delete newCodes[updatedLink.id];
        return newCodes;
      });
    }
  };

  const handleDeleteSuccess = () => {
    if (selectedLink) {
      setLinks((prev) => prev.filter((link) => link.id !== selectedLink.id));
      setLinkQrCodes((prev) => {
        const newCodes = { ...prev };
        delete newCodes[selectedLink.id];
        return newCodes;
      });
      setSelectedLink(null);
    }
  };

  const handleEditClick = (link: LinkRedirect) => {
    setSelectedLink(link);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (link: LinkRedirect) => {
    setSelectedLink(link);
    setDeleteDialogOpen(true);
  };


  return (
    <div className="page-shell max-w-6xl">
      <div className="page-header">
        <h1 className="page-title">QR Generator</h1>
        <p className="page-subtitle">Generate QR codes and manage redirect links.</p>
      </div>

      {/* QR Code Generator Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Generate QR Code</h2>
          <p className="text-sm text-muted-foreground">
            Enter a destination URL to generate a QR code.
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Enter URL (e.g., https://example.com)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generateQRCode()}
          />
          <Button onClick={generateQRCode} disabled={!url.trim() || isGenerating}>
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Generating
              </span>
            ) : (
              "Generate"
            )}
          </Button>
        </div>

        {/* Hidden canvas for QR code generation */}
        <canvas ref={canvasRef} className="hidden" />

        {qrCodeUrl && (
          <div className="space-y-4">
            <div className="surface-card flex flex-col items-center gap-4">
              <img
                src={qrCodeUrl}
                alt="Generated QR Code"
                className="w-[400px] h-[400px]"
              />
              <div className="text-sm text-muted-foreground text-center break-all max-w-md">
                {url}
              </div>
            </div>
            <Button onClick={downloadQRCode} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download QR Code
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Links Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="page-header">
            <h2 className="text-xl font-semibold">Link Redirects</h2>
            <p className="text-sm text-muted-foreground">
              Create and manage link redirects that track visits before redirecting.
            </p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Link
          </Button>
        </div>

        {isLoadingLinks ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : links.length === 0 ? (
          <Card className="p-6">
            <CardHeader className="p-0">
              <CardTitle>No links found</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Create your first link redirect to get started
              </p>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {links.map((link) => {
              const redirectUrl = `${getWwwUrl()}/link/${link.slug}`;
              const hasQRCode = !!linkQrCodes[link.id];
              
              return (
                <Card key={link.id} className="p-4">
                  <CardHeader className="p-0 pb-4">
                    <CardTitle className="text-lg">{link.name}</CardTitle>
                    <div className="text-sm text-muted-foreground space-y-1 mt-2">
                      <p className="break-all">
                        <span className="font-medium">Redirects to:</span> {link.destination_url}
                      </p>
                      <p>
                        <span className="font-medium">Visits:</span> {link.visit_count}
                      </p>
                      <p className="break-all">
                        <span className="font-medium">Redirect URL:</span>{" "}
                        <a
                          href={redirectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {redirectUrl}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 space-y-3">
                    {hasQRCode && (
                      <div className="relative flex flex-col items-center gap-2 rounded-lg border border-border/60 bg-card/80 p-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setLinkQrCodes((prev) => {
                              const newCodes = { ...prev };
                              delete newCodes[link.id];
                              return newCodes;
                            });
                          }}
                          className="absolute top-2 right-2 h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <img
                          src={linkQrCodes[link.id]}
                          alt={`QR Code for ${link.name}`}
                          className="w-32 h-32"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadLinkQRCode(link)}
                          className="w-full"
                        >
                          <Download className="h-3 w-3 mr-2" />
                          Download QR
                        </Button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyRedirectUrl(link)}
                        className="flex-1"
                      >
                        <Copy className="h-3 w-3 mr-2" />
                        Copy URL
                      </Button>
                      {!hasQRCode && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateLinkQRCode(link)}
                          className="flex-1"
                        >
                          <QrCode className="h-3 w-3 mr-2" />
                          Generate QR
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditClick(link)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteClick(link)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddLinkRedirectDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={handleAddSuccess}
      />

      <EditLinkRedirectDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        link={selectedLink}
        onSuccess={handleEditSuccess}
      />

      <DeleteLinkRedirectDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        link={selectedLink}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}
