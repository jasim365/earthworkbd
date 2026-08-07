import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function NoProject() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No project selected. Create or open a project from the dashboard.
        </p>
        <Button asChild>
          <Link to="/">Go to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
