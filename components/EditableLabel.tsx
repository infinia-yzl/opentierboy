import React, {useState, useEffect, useRef} from 'react';
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

/**
 * Editing text in place: `draft` is the text being typed, or null while not editing. Enter or
 * leaving the box saves the new text; Escape restores the old text and saves nothing.
 */
export function useInlineEdit(text: string, onSave: (newText: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const isEditing = draft !== null;
  // Set once the edit ends. The box can still report a blur while it disappears; that blur
  // comes from the render before the edit ended, so a ref is the only safe way to ignore it.
  const editEnded = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const startEditing = (value: string) => {
    editEnded.current = false;
    setDraft(value);
  };

  const endEditing = (save: boolean) => {
    if (editEnded.current || draft === null) return;
    editEnded.current = true;
    setDraft(null);
    if (save) onSave(draft);
  };

  const inputProps = {
    ref: inputRef,
    type: 'text',
    value: draft ?? text,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => startEditing(e.target.value),
    onBlur: () => endEditing(true),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        endEditing(true);
      } else if (e.key === 'Escape') {
        endEditing(false);
      }
    },
  } as const;

  return {isEditing, edit: () => {
    if (!isEditing) startEditing(text);
  }, inputProps};
}

interface EditableLabelProps {
  text: string;
  onSave: (newText: string) => void;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  contentClassName?: string;
  placeholder?: string;
  /** A name for screen readers while the text is empty, so an empty heading still has one. */
  emptyLabel?: string;
  /** Shown while the text is empty (the Unranked tray's heading). A click edits from empty. */
  emptyText?: string;
}

/** A label that turns into a text box on click (see useInlineEdit). */
const EditableLabel: React.FC<EditableLabelProps> = ({
  text,
  onSave,
  className = '',
  as: Component = 'span',
  contentClassName = 'text-xl font-semibold',
  placeholder = '',
  emptyLabel,
  emptyText,
}) => {
  const {isEditing, edit, inputProps} = useInlineEdit(text, onSave);

  const renderContent = () => {
    if (isEditing || (!text && placeholder)) {
      return (
        <Input
          {...inputProps}
          className={cn(contentClassName, 'py-6 min-w-24 text-center')}
          placeholder={placeholder}
        />
      );
    } else if (text) {
      return <Component className={contentClassName}>{text}</Component>;
    } else {
      return (
        <Component className={contentClassName}>
          {emptyText ?? (emptyLabel && <span className="sr-only">{emptyLabel}</span>)}
        </Component>
      );
    }
  };

  return (
    <div onClick={edit} className={`relative ${className}`}>
      {renderContent()}
    </div>
  );
};

export default EditableLabel;
