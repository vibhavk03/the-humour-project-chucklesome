import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Spinner from "@/components/ui/spinner";
import { LucideIcon } from "lucide-react";

interface IOverviewCard {
  title: string;
  description?: string | undefined;
  content: number;
  footer?: string | undefined;
  icon?: LucideIcon | undefined;
  isLoading?: boolean;
}

export default function OverviewCard({
  title,
  description,
  content,
  footer,
  icon: Icon,
  isLoading = false,
}: IOverviewCard) {
  const formattedContent = Number.isFinite(content) ? content.toLocaleString() : "0";

  return (
    <Card className="w-[500px]">
      <CardHeader>
        <div className="flex justify-between">
          <CardTitle>{title}</CardTitle>
          {Icon && <Icon className="h-6 w-6 text-primary" />}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-2">
            <Spinner size="sm">Loading</Spinner>
          </div>
        ) : (
          <p className="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
            {formattedContent}
          </p>
        )}
      </CardContent>
      <CardFooter>
        {/* <p>{footer}</p> */}
      </CardFooter>
    </Card>
  );
}
