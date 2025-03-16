import { Label } from "@/components/ui/label";
import React from "react";

interface FormFieldProps {
  name: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ name, label, error, children }: FormFieldProps) {
  return (
    <div className='grid grid-cols-4 items-center gap-4'>
      <Label htmlFor={name} className='text-right'>
        {label}
      </Label>
      <div className='col-span-3'>
        {children}
        {error && <p className='text-sm text-red-500 mt-1'>{error}</p>}
      </div>
    </div>
  );
}
