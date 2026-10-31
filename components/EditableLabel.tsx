import React, {useState, useEffect, useRef} from 'react';
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

interface EditableLabelProps {
  text: string;
  onSave: (newText: string) => void;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  contentClassName?: string;
  placeholder?: string;
}

/**
 * A label that turns into a text box on click. Enter or clicking away saves the new text;
 * Escape restores the old text and saves nothing.
 */
const EditableLabel: React.FC<EditableLabelProps> = ({
  text,
  onSave,
  className = '',
  as: Component = 'span',
  contentClassName = 'text-xl font-semibold',
  placeholder = ''
}) => {
  // The text being typed; null while not editing, when the box shows `text`.
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

  const handleClick = () => {
    if (!isEditing) startEditing(text);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startEditing(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      endEditing(true);
    } else if (e.key === 'Escape') {
      endEditing(false);
    }
  };

  const renderContent = () => {
    if (isEditing || (!text && placeholder)) {
      return (
        <Input
          ref={inputRef}
          type="text"
          value={draft ?? text}
          onChange={handleChange}
          onBlur={() => endEditing(true)}
          onKeyDown={handleKeyDown}
          className={cn(contentClassName, 'py-6 min-w-24 text-center')}
          placeholder={placeholder}
        />
      );
    } else if (text) {
      return <Component className={contentClassName}>{text}</Component>;
    } else {
      return <Component className={contentClassName}></Component>;
    }
  };

  return (
    <div onClick={handleClick} className={`relative ${className}`}>
      {renderContent()}
    </div>
  );
};

export default EditableLabel;
