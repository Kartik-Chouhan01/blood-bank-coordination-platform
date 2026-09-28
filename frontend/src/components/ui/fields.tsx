import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';
import { FormField, Input } from './FormField';

interface BaseFieldProps {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  hint?: string;
  required?: boolean;
}

type TextFieldProps = BaseFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'name'>;

/** Text input wired to react-hook-form with accessible label, hint and error. */
export function TextField({
  label,
  registration,
  error,
  hint,
  required,
  ...inputProps
}: TextFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          invalid={invalid}
          {...inputProps}
          {...registration}
        />
      )}
    </FormField>
  );
}

export function PasswordField(props: Omit<TextFieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField label={props.label} error={props.error} hint={props.hint} required={props.required}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            aria-describedby={describedBy}
            aria-required={props.required || undefined}
            invalid={invalid}
            className="pr-10"
            autoComplete={props.autoComplete}
            {...props.registration}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
          >
            {visible ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
      )}
    </FormField>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        'block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900',
        'focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none',
        invalid ? 'border-red-500' : 'border-slate-300',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

type SelectFieldProps = BaseFieldProps & {
  options: readonly { value: string; label: string }[];
  placeholder?: string;
};

export function SelectField({
  label,
  registration,
  error,
  hint,
  required,
  options,
  placeholder,
}: SelectFieldProps) {
  return (
    <FormField label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          invalid={invalid}
          defaultValue=""
          {...registration}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </FormField>
  );
}

interface CheckboxFieldProps {
  registration: UseFormRegisterReturn;
  error?: string;
  children: ReactNode;
}

export function CheckboxField({ registration, error, children }: CheckboxFieldProps) {
  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-4 rounded border-slate-300 accent-brand-600"
          {...registration}
        />
        <span>{children}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
