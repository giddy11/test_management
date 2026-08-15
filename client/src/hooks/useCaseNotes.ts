import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CaseNoteEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"

const KEY = "case-notes"
const RUN_NOTES_KEY = "case-run-notes"

export function useCaseNotes(caseId: string) {
  return useQuery({
    queryKey: [KEY, caseId],
    queryFn: async () => {
      const res = await CaseNoteEndpoints.fetchAll(caseId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(caseId),
  })
}

// Notes recorded during runs — read-only, recorded from the run detail page.
export function useCaseRunNotes(caseId: string) {
  return useQuery({
    queryKey: [RUN_NOTES_KEY, caseId],
    queryFn: async () => {
      const res = await CaseNoteEndpoints.fetchRunNotes(caseId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res.data ?? []
    },
    enabled: Boolean(caseId),
  })
}

export function useAddCaseNote(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await CaseNoteEndpoints.create(caseId, body)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, caseId] }),
  })
}

export function useDeleteCaseNote(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (noteId: string) => {
      const res = await CaseNoteEndpoints.remove(caseId, noteId)
      if (!res.success) throw new ApiError(res.message, res.statusCode)
      return res
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, caseId] }),
  })
}
