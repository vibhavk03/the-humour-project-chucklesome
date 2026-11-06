import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Calendar, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useTimeZone } from "@/components/TimeZoneContext";

interface IUserCaptionsDrawer {
  open: boolean;
  onClose: () => void;
  user_id: string;
  userCaptions?: any[];
}

export default function UserCaptionsDrawer({ open, onClose, user_id, userCaptions = [] }: IUserCaptionsDrawer) {
  const { timeZone } = useTimeZone();
  
  const handleCopyCaption = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Caption Copied",
      description: "Caption text copied to clipboard",
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const getMidnightUtc = (value: Date) => {
      const parts = dateFormatter.formatToParts(value);
      const year = Number(parts.find(part => part.type === "year")?.value ?? 0);
      const month = Number(parts.find(part => part.type === "month")?.value ?? 1);
      const day = Number(parts.find(part => part.type === "day")?.value ?? 1);
      return Date.UTC(year, month - 1, day);
    };
    const diffTime = Math.abs(getMidnightUtc(now) - getMidnightUtc(date));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      timeZone,
    });
  };

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="max-w-3xl mx-auto">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            User Captions
            <Badge variant="secondary" className="ml-2">
              {userCaptions.length} total
            </Badge>
          </DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="h-[70vh] px-4">
          <div className="space-y-3 py-4">
            {userCaptions.length > 0 ? (
              userCaptions.map((caption) => (
                <Card key={caption.id} className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Caption Text */}
                      <div className="relative">
                        <p className="text-sm leading-relaxed pr-8">
                          {caption.text || caption.caption_text || 'No caption text'}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyCaption(caption.text || caption.caption_text || '')}
                          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {/* Metadata */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-4">
                          {/* Date */}
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(caption.created_datetime_utc || caption.created_at)}</span>
                          </div>
                          
                          {/* Model */}
                          {caption.model && (
                            <Badge variant="outline" className="text-xs">
                              {caption.model}
                            </Badge>
                          )}
                          
                          {/* Style */}
                          {caption.style && (
                            <Badge variant="outline" className="text-xs">
                              {caption.style}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Caption ID (minimized) */}
                        <span className="font-sans text-xs opacity-50">
                          {caption.id?.substring(0, 8)}...
                        </span>
                      </div>
                      
                      {/* Associated Image */}
                      {caption.image_id && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <ExternalLink className="h-3 w-3" />
                            <span>Image: {caption.image_id.substring(0, 8)}...</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No captions found for this user</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
