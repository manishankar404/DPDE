import Card from "../components/Card";
import Button from "../components/Button";
import { useTheme } from "../context/ThemeContext";

export default function PatientSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <Card title="Settings" subtitle="Customize your experience">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Theme
            </div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Choose light or dark mode. Your preference is saved on this device.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={theme === "light" ? "primary" : "ghost"}
                onClick={() => setTheme("light")}
              >
                Light
              </Button>
              <Button
                type="button"
                variant={theme === "dark" ? "primary" : "ghost"}
                onClick={() => setTheme("dark")}
              >
                Dark
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

