import React, {useState, useEffect, useRef} from 'react';
import {Input} from "@/components/ui/input";

interface EditableLabelProps {
  text: string;
  onSave: (newText: string) => void;
  className?: string;
}

const EditableLabel: React.FC<EditableLabelProps> = ({text, onSave, className = ''}) => {
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

  return (
    <div onClick={handleClick} className={`relative ${className}`}>
      {isEditing ? (
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="text-xl font-semibold p-1 border rounded"
        />
      ) : (
        <span className="text-xl font-semibold">{text}</span>
      )}
    </div>
  );
};

export default EditableLabel;
