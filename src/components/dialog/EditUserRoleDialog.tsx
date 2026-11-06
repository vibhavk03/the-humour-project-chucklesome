import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserService } from "@/services/users.service";
import { useToast } from "@/hooks/use-toast";

interface EditUserRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user_id: string;
  user_email: string;
  onRoleChange?: (isAdmin: boolean) => void;
}

export default function EditUserRoleDialog({ isOpen, onClose, user_id, user_email, onRoleChange }: EditUserRoleDialogProps) {
  const { toast } = useToast();

  const handleSetAdmin = async () => {
    try {
      await UserService.setUserAsAdmin(user_id);
      toast({
        title: "Success",
        description: `Successfully set ${user_email} as SuperAdmin`,
      });
      if (onRoleChange) {
        onRoleChange(true);
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    }
  };

  const handleSetUser = async () => {
    try {
      await UserService.setUserAsUser(user_id);
      toast({
        title: "Success",
        description: `Successfully set ${user_email} as regular user`,
      });
      if (onRoleChange) {
        onRoleChange(false);
      }
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User Role</DialogTitle>
        </DialogHeader>
        <DialogDescription>
            How would you like to edit the role of {user_email}?
        </DialogDescription>
        <DialogFooter>
          <Button onClick={handleSetAdmin}>Set as SuperAdmin</Button>
          <Button onClick={handleSetUser}>Set as User</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
