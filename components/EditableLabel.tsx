import React, { useState, useEffect, useRef } from 'react';

interface EditableLabelProps {
  text: string;
  onSave: (newText: string) => void;
  className?: string;
}

const EditableLabel: React.FC<EditableLabelProps> = ({ text, onSave, className = '' }) => {
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
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="text-xl font-bold p-1 bg-gray-800 border border-gray-600 rounded"
        />
      ) : (
        <span className="text-xl font-bold">{text}</span>
      )}
    </div>
  );
};

export default EditableLabel;
