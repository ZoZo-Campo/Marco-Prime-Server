import { Delete } from "lucide-preact";
import { Button } from "../../ui/button";

interface KeypadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
}

export function Keypad({
  value,
  onChange,
  maxLength = 6,
  disabled = false,
}: KeypadProps) {
  const handleDigit = (digit: string) => {
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  };

  const handleDelete = () => {
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <div class="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
        <Button
          key={digit}
          variant="outline"
          size="lg"
          class="text-2xl font-bold h-14"
          onClick={() => handleDigit(digit)}
          disabled={disabled}
        >
          {digit}
        </Button>
      ))}
      <Button
        variant="destructive"
        size="lg"
        class="text-sm font-bold h-14"
        onClick={handleClear}
        disabled={disabled}
      >
        CLR
      </Button>
      <Button
        variant="outline"
        size="lg"
        class="text-2xl font-bold h-14"
        onClick={() => handleDigit("0")}
        disabled={disabled}
      >
        0
      </Button>
      <Button
        variant="outline"
        size="lg"
        class="h-14"
        onClick={handleDelete}
        disabled={disabled}
      >
        <Delete class="size-6" />
      </Button>
    </div>
  );
}
