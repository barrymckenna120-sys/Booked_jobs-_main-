import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RED_BORDER } from "@/lib/customerValidation";

interface Props {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | null;
  required?: boolean;
  type?: string;
  maxLength?: number;
  placeholder?: string;
}

const CustomerFormField = ({ label, id, value, onChange, onBlur, error, required, type = "text", maxLength, placeholder }: Props) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs text-muted-foreground">
      {label}{required && " *"}
    </Label>
    <Input
      id={id}
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      maxLength={maxLength}
      placeholder={placeholder}
      className={error ? RED_BORDER : ""}
    />
    {error && <p className="text-xs mt-1 font-medium" style={{ color: "#EF4444" }}>{error}</p>}
  </div>
);

export default CustomerFormField;
