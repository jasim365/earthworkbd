import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects, useActiveProject, setActiveProject } from "@/lib/earthwork/store";

export function ProjectSwitcher() {
  const projects = useProjects();
  const active = useActiveProject();
  if (projects.length === 0) return null;

  return (
    <Select value={active?.id ?? ""} onValueChange={setActiveProject}>
      <SelectTrigger className="h-9 w-[min(20rem,60vw)]">
        <SelectValue placeholder="Select project" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
