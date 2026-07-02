import { useMutation } from "@tanstack/react-query"
import { ExportEndpoints } from "@/endpoints/testMgmt.endpoints"

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "export"

export function useExportSuite(suiteId: string, suiteName: string) {
  return useMutation({
    mutationFn: () => ExportEndpoints.suite(suiteId, `${slugify(suiteName)}-test-cases.xlsx`),
  })
}

export function useExportProject(projectId: string, projectName: string) {
  return useMutation({
    mutationFn: () => ExportEndpoints.project(projectId, `${slugify(projectName)}-test-suites.xlsx`),
  })
}
