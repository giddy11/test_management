// components/shared/PhoneInput.tsx — standard international phone input: a
// country-code flag/dropdown button next to a text field, styled to match
// the app's shadcn Input. Wraps react-phone-number-input (E.164 values).
import { forwardRef } from "react"
import PhoneInputBase from "react-phone-number-input"
import type { Country, Value } from "react-phone-number-input"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const PhoneTextField = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (props, ref) => <Input ref={ref} {...props} />
)
PhoneTextField.displayName = "PhoneTextField"

interface PhoneInputProps {
  id?: string
  value: string | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  disabled?: boolean
  defaultCountry?: Country
  className?: string
}

export function PhoneInput({
  id,
  value,
  onChange,
  placeholder = "Phone number",
  disabled,
  defaultCountry = "NG",
  className,
}: PhoneInputProps) {
  return (
    <PhoneInputBase
      id={id}
      international
      defaultCountry={defaultCountry}
      value={value as Value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      inputComponent={PhoneTextField}
      className={cn(className)}
    />
  )
}
