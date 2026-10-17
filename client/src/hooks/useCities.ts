// hooks/useCities.ts — the city list for an address form's City dropdown.
// country-state-city's city data is ~8 MB (every city in the world), most of the
// app's bundle if imported statically. It is loaded here on demand instead: the
// first time a form has a country picked, then kept for the rest of the visit.
import { useEffect, useMemo, useState } from "react"
import type { ICity } from "country-state-city/lib/interface"

type CityApi = (typeof import("country-state-city/lib/city"))["default"]

let cityApi: CityApi | null = null
let pending: Promise<CityApi> | null = null

function loadCityApi(): Promise<CityApi> {
  pending ??= import("country-state-city/lib/city")
    .then((m) => (cityApi = m.default))
    .catch((e) => {
      // Let the next render retry (e.g. after a dropped connection).
      pending = null
      throw e
    })
  return pending
}

// Cities of the state when one is given, otherwise of the whole country. Empty
// until the data has loaded, or when no country is selected.
export function useCities(countryCode?: string, stateCode?: string): ICity[] {
  const [api, setApi] = useState<CityApi | null>(cityApi)

  useEffect(() => {
    if (api || !countryCode) return
    let cancelled = false
    loadCityApi()
      .then((loaded) => !cancelled && setApi(() => loaded))
      .catch(() => {
        // The field just stays empty; picking another country retries.
      })
    return () => {
      cancelled = true
    }
  }, [api, countryCode])

  return useMemo(() => {
    if (!api || !countryCode) return []
    return stateCode ? api.getCitiesOfState(countryCode, stateCode) : (api.getCitiesOfCountry(countryCode) ?? [])
  }, [api, countryCode, stateCode])
}
