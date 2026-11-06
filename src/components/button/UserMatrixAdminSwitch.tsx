import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface UserMatrixAdminSwitchProps {
  id: string;
  isMatrixAdmin: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
}

export function UserMatrixAdminSwitch({
  id,
  isMatrixAdmin,
  onToggle,
  disabled = false,
}: UserMatrixAdminSwitchProps) {
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id={id}
        checked={Boolean(isMatrixAdmin)}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <Label htmlFor={id}>Matrix Admin</Label>
    </div>
  );
}
