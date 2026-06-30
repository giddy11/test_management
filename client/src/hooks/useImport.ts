import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ImportEndpoints } from "@/endpoints/testMgmt.endpoints"
import { ApiError } from "@/transport/http"

export function useUploadImport(suiteId: string) {
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await ImportEndpoints.upload(suiteId, file)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
  })
}

export function useConfirmImport(suiteId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (importId: string) => {
      const res = await ImportEndpoints.confirm(importId)
      if (!res.success || !res.data) throw new ApiError(res.message, res.statusCode, res.errors)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases", suiteId] }),
  })
}
