import { ReportedImages } from "@/types/images";
import { ReportedCaptions } from "@/types/captions";
import { useTimeZone } from "@/components/TimeZoneContext";

type ReportedItem = ReportedImages | ReportedCaptions;

interface ReportedItemCardProps {
  item: ReportedItem;
  type: 'image' | 'caption';
  onDelete: (id: string) => void;
  onKeep: (reportedId: number) => void;
}

export function ReportedItemCard({ item, type, onDelete, onKeep }: ReportedItemCardProps) {
  const { timeZone } = useTimeZone();
  const isImage = type === 'image';
  const userName = `${item.profiles?.first_name} ${item.profiles?.last_name}`;
  const dateFormatted = item.created_datetime_utc
    ? new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone,
        timeZoneName: "short",
      }).format(new Date(item.created_datetime_utc))
    : "Date not available";

  const contentId = isImage ? (item as ReportedImages).image_id : (item as ReportedCaptions).caption_id;
  const imageUrl = isImage
    ? (item as ReportedImages).images?.url
    : (item as ReportedCaptions).captions?.images?.url;
  const captionContent = !isImage ? (item as ReportedCaptions).captions?.content || "No content available" : undefined;

  return (
    <div
      key={item.id}
      className="p-8 cursor-pointer rounded-xl shadow hover:shadow-lg 
                transition bg-muted/60 text-foreground flex flex-col justify-between 
                hover:bg-muted"
    >
      {/* User firstname + lastname */}
      <h2 className="text-lg font-bold mb-2">
        {userName}
      </h2>

      {/* Reported Content */}
      {isImage ? (
        <>
          Reported Image:
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Reported Image"
              className="w-full h-auto rounded-lg mb-4"
            />
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-muted-foreground">
            <strong> Reported Caption: </strong>
          </p>
          <p className="text-sm text-foreground mb-4">
            {captionContent}
          </p>
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Reported Caption Image"
              className="w-full h-auto rounded-lg mb-4"
            />
          )}
        </>
      )}

      {/* Reason */}
      <p className="text-sm text-foreground mb-2">
        <strong>Report Details: </strong> <br />
        Reported at: {dateFormatted} <br />
      </p>
      <p className="text-sm text-foreground">
        <strong>Reason: </strong> {item.reason} 
      </p>
      <div>
        {/* Buttons */}
        <div className="flex justify-center items-center space-x-4 mt-4">
          <button
            onClick={() => {
              const confirmDelete = window.confirm(
                `Are you sure you want to delete this ${type}?`
              );
              if (confirmDelete && contentId) {
                onDelete(contentId);
              }
            }}            
            disabled={!contentId}
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded 
            hover:bg-destructive/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Delete {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
          <button
            onClick={() => {
              const confirmKeep = window.confirm(
                `Are you sure you want to keep this ${type}?`
              );
              if (confirmKeep) {
                onKeep(item.id);
              }
            }}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded 
            hover:bg-secondary/80 transition"
          >
            Keep {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        </div>
      </div>
    </div>
  );
}
