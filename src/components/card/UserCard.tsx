import User from "@/types/user";
import { useState, useEffect, memo } from "react";
import Link from "next/link";
import UserImagesDialog from "@/components/dialog/UserImagesDialog";
import { 
  Edit, 
  Image as ImageIcon, 
  MessageSquare, 
  User as UserIcon,
  Clock,
  Calendar,
  MoreVertical,
  Shield
} from "lucide-react";
import EditUserRoleDialog from "@/components/dialog/EditUserRoleDialog";
import { UserRoleSwitch } from "@/components/button/UserRoleSwitch";
import { UserMatrixAdminSwitch } from "@/components/button/UserMatrixAdminSwitch";
import { UserService } from "@/services/users.service";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface UserCardProps {
  user: User;
  email: string;
  isSuperAdmin: boolean;
  isMatrixAdmin: boolean;
  signupDate?: string;
  lastLogin?: string | null;
  activityCounts?: { images: number; captions: number };
  showId?: boolean;
}

function UserCard({
  user,
  email,
  isSuperAdmin,
  isMatrixAdmin: isMatrixAdminProp,
  signupDate,
  lastLogin,
  activityCounts,
  showId = false,
}: UserCardProps) {
  const [isImagesDialogOpen, setIsImagesDialogOpen] = useState(false);
  const [isEditUserRoleDialogOpen, setIsEditUserRoleDialogOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(isSuperAdmin);
  const [isMatrixAdmin, setIsMatrixAdmin] = useState<boolean>(isMatrixAdminProp);
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [isMatrixLoading, setIsMatrixLoading] = useState(false);
  const [userImages, setUserImages] = useState<any[]>([]);
  const [userCaptions, setUserCaptions] = useState<any[]>([]);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  useEffect(() => {
    setIsAdmin(isSuperAdmin);
    setIsMatrixAdmin(isMatrixAdminProp);
  }, [isSuperAdmin, isMatrixAdminProp]);

  // Lazy load user content on hover or when drawers open
  const loadUserContent = async () => {
    if (contentLoaded || isLoadingContent) return;
    
    setIsLoadingContent(true);
    try {
      const [images, captions] = await Promise.all([
        UserService.getUserImagesById(user.id),
        UserService.getUserCaptions(user.id)
      ]);
      setUserImages(images);
      setUserCaptions(captions);
      setContentLoaded(true);
    } catch (error) {
      console.error("Error loading user content:", error);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const displayName = user.first_name || user.last_name 
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
    : null;

  const handleViewImages = async () => {
    await loadUserContent();
    setIsImagesDialogOpen(true);
  };

  const handleRoleChange = (isUserAdmin: boolean) => {
    setIsAdmin(isUserAdmin);
  };

  const handleToggleRole = async (newIsAdmin: boolean) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User ID is missing. Unable to update role.",
        variant: "destructive",
      });
      return;
    }

    setIsRoleLoading(true);
    try {
      if (newIsAdmin) {
        await UserService.setUserAsAdmin(user.id);
      } else {
        await UserService.setUserAsUser(user.id);
      }

      setIsAdmin(newIsAdmin);
      toast({
        title: "Role updated",
        description: `${displayName || "User"} is now ${newIsAdmin ? "a SuperAdmin" : "a regular user"}.`,
      });
    } catch (error) {
      setIsAdmin(!newIsAdmin);
      toast({
        title: "Error",
        description: "Failed to update user role. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRoleLoading(false);
    }
  };

  const handleToggleMatrixAdmin = async (newIsMatrixAdmin: boolean) => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User ID is missing. Unable to update matrix admin status.",
        variant: "destructive",
      });
      return;
    }

    setIsMatrixLoading(true);
    try {
      if (newIsMatrixAdmin) {
        await UserService.setUserAsMatrixAdmin(user.id);
      } else {
        await UserService.setUserAsMatrixUser(user.id);
      }

      setIsMatrixAdmin(newIsMatrixAdmin);
      toast({
        title: "Matrix admin updated",
        description: `${displayName || "User"} is now ${
          newIsMatrixAdmin ? "a Matrix Admin" : "a Matrix User"
        }.`,
      });
    } catch (error) {
      setIsMatrixAdmin(!newIsMatrixAdmin);
      toast({
        title: "Error",
        description: "Failed to update matrix admin status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsMatrixLoading(false);
    }
  };

  // Determine activity status color
  const getActivityColor = () => {
    if (!lastLogin) return "text-muted-foreground";
    if (lastLogin.includes("Just now") || lastLogin.includes("h ago")) return "text-green-500";
    if (lastLogin.includes("d ago") && parseInt(lastLogin) <= 7) return "text-green-400";
    if (lastLogin.includes("w ago") && parseInt(lastLogin) <= 4) return "text-yellow-500";
    return "text-muted-foreground";
  };

  return (
    <>
      <div 
        className="grid grid-cols-12 gap-4 items-center px-4 py-3 hover:bg-muted/30 transition-colors group"
        onMouseEnter={loadUserContent}
      >
        {/* User Info Section - Enhanced with better layout */}
        <div className="col-span-4 pr-4">
          <div className="flex items-start gap-3">
            {/* User Avatar/Icon */}
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
              isAdmin ? "bg-orange-100 dark:bg-orange-900/30" : "bg-muted"
            )}>
              {displayName ? (
                <span className={cn(
                  "text-sm font-semibold",
                  isAdmin ? "text-orange-600 dark:text-orange-400" : "text-foreground"
                )}>
                  {displayName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <UserIcon className={cn(
                  "h-5 w-5",
                  isAdmin ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
                )} />
              )}
            </div>
            
            {/* User Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-sm text-foreground truncate">
                  {displayName || 'Anonymous User'}
                </h3>
                {isAdmin && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Shield className="h-3 w-3 text-orange-500" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Superadmin</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground truncate">
                {email || 'no-email@example.com'}
              </p>
              
              {/* ID - show when searching by ID or on hover */}
              <div className={cn(
                "flex items-center gap-3 mt-1 transition-opacity",
                showId ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(user.id);
                          toast({
                            title: "ID Copied",
                            description: "User ID copied to clipboard",
                          });
                        }}
                        className="text-xs text-muted-foreground/60 hover:text-muted-foreground font-sans cursor-pointer"
                      >
                        ID: {user.id.substring(0, 8)}...
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-sans text-xs">{user.id}</p>
                      <p className="text-xs mt-1">Click to copy</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
        
        {/* Activity Section - Images & Captions */}
        <div className="col-span-2 text-center">
          <div className="flex justify-center gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/user/${user.id}/images`}
                    className="flex items-center gap-1 text-sm hover:text-primary transition-colors cursor-pointer"
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span className="font-medium">
                      {activityCounts?.images ?? 0}
                    </span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">View images</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/user/${user.id}/captions`}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span className="font-medium">
                      {activityCounts?.captions ?? 0}
                    </span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">View captions</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        
        {/* Signup Date */}
        <div className="col-span-2 text-center justify-center items-center">
          <div className="flex items-center justify-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <p className="text-sm">{signupDate || '—'}</p>
          </div>
        </div>
        
        {/* Role */}
        <div className="col-span-2 flex flex-col justify-center items-center gap-2">
          <UserRoleSwitch
            id={`is-superadmin-${user.id}`}
            isSuperAdmin={isAdmin}
            onToggle={handleToggleRole}
            disabled={isRoleLoading}
          />
          <UserMatrixAdminSwitch
            id={`is-matrix-admin-${user.id}`}
            isMatrixAdmin={isMatrixAdmin}
            onToggle={handleToggleMatrixAdmin}
            disabled={isMatrixLoading}
          />
        </div>
        
        {/* Actions */}
        <div className="col-span-2 text-center">
          <div className="flex items-center justify-center gap-1">
            {/* Last Login Indicator */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1 rounded",
                    getActivityColor()
                  )}>
                    <Clock className="h-3 w-3" />
                    <span>{lastLogin || 'Never'}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Last login</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleViewImages}>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  View Images & Captions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsEditUserRoleDialogOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Role
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      
      {/* Dialog */}
      <UserImagesDialog 
        open={isImagesDialogOpen} 
        onClose={() => setIsImagesDialogOpen(false)} 
        user_id={user.id} 
      />
      
      {/* Dialog */}
      <EditUserRoleDialog 
        isOpen={isEditUserRoleDialogOpen} 
        onClose={() => setIsEditUserRoleDialogOpen(false)} 
        user_id={user.id}
        user_email={email} 
        onRoleChange={handleRoleChange}
      />
    </>
  );
}

// Memoize the component to prevent unnecessary re-renders
export default memo(UserCard);
