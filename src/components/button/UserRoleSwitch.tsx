import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface UserRoleSwitchProps {
  id: string;
  isSuperAdmin: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
}

export function UserRoleSwitch({ id, isSuperAdmin, onToggle, disabled = false }: UserRoleSwitchProps) {
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={id}
        checked={Boolean(isSuperAdmin)}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <Label htmlFor={id}>Super Admin</Label>
    </div>
  );
}
