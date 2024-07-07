import React, {useState, useEffect, useRef} from 'react';
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

interface EditableLabelProps {
  text: string;
  onSave: (newText: string) => void;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
  contentClassName?: string;
  placeholder?: string;
}

const EditableLabel: React.FC<EditableLabelProps> = ({
  text,
  onSave,
  className = '',
  as: Component = 'span',
  contentClassName = 'text-xl font-semibold',
  placeholder = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(text);
    }
  }, [text, isEditing]);

  const handleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    onSave(inputValue);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  const renderContent = () => {
    if (isEditing || (!text && placeholder)) {
      return (
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
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
