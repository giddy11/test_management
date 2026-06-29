import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This section isn't built yet. The sign-up, login, and dashboard shell are in place —
          feature pages plug in here next.
        </CardContent>
      </Card>
    </div>
  )
}
