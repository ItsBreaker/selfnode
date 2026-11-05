import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePref } from "../theme";
import { Segmented } from "./Segmented";

export function ThemeToggle({
  value,
  onChange,
}: {
  value: ThemePref;
  onChange: (v: ThemePref) => void;
}) {
  return (
    <Segmented
      label="Colour theme"
      size="sm"
      value={value}
      onChange={onChange}
      options={[
        { value: "light", label: <Sun size={14} aria-hidden />, ariaLabel: "Light theme" },
        {
          value: "system",
          label: <Monitor size={14} aria-hidden />,
          ariaLabel: "Match system theme",
        },
        { value: "dark", label: <Moon size={14} aria-hidden />, ariaLabel: "Dark theme" },
      ]}
    />
  );
}
