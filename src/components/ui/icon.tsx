import {
  Bot,
  Boxes,
  Braces,
  Code2,
  FileCode2,
  FlaskConical,
  Folder,
  LayoutGrid,
  LockKeyhole,
  Plug,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
export const icons: Record<string, LucideIcon> = {
  bot: Bot,
  boxes: Boxes,
  code: Code2,
  file: FileCode2,
  test: FlaskConical,
  folder: Folder,
  grid: LayoutGrid,
  lock: LockKeyhole,
  plug: Plug,
  scan: ScanLine,
  shield: ShieldCheck,
  spark: Sparkles,
  workflow: Workflow,
  braces: Braces,
};
export function Icon({
  name,
  size = 20,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Component = icons[name] ?? Bot;
  return <Component size={size} aria-hidden="true" {...props} />;
}
