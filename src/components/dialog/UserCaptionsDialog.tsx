import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Copy, Calendar, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { UserService } from "@/services/users.service";
import { useTimeZone } from "@/components/TimeZoneContext";

interface IUserCaptionsDialog {
  open: boolean;
  onClose: () => void;
  user_id: string;
  userCaptions?: any[];
}

export default function UserCaptionsDialog({ open, onClose, user_id, userCaptions = [] }: IUserCaptionsDialog) {
  const { timeZone } = useTimeZone();
  const [captions, setCaptions] = useState<any[]>(userCaptions);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchUserCaptions = async () => {
      if (userCaptions.length > 0) {
        setCaptions(userCaptions);
        return;
      }
      
      setIsLoading(true);
      try {
        const fetchedCaptions = await UserService.getUserCaptions(user_id);
        setCaptions(fetchedCaptions || []);
      } catch (error) {
        console.error("Error fetching user captions:", error);
        setCaptions([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (open) {
      fetchUserCaptions();
    }
  }, [open, user_id, userCaptions]);

  const copyCaption = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Caption copied",
      description: "Caption text copied to clipboard",
    });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold">User Captions</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {captions.length} {captions.length === 1 ? 'caption' : 'captions'} found
          </p>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 py-6">
              {captions.length > 0 ? (
                captions.map((caption) => (
                  <div 
                    key={caption.id} 
                    className="group p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {caption.caption_text || '—'}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(caption.created_datetime_utc)}</span>
                          </div>
                          {caption.image_id && (
                            <div className="flex items-center gap-1">
                              <span>Image ID: {caption.image_id.substring(0, 8)}...</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyCaption(caption.caption_text || '')}
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-muted-foreground">No captions found for this user</p>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
