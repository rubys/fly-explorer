import React from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  error?: boolean;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isError = message.error;
  
  // Clean up XML formatting and other unwanted markup
  const cleanContent = (content: string) => {
    return content
      // Remove XML tags like <thinking>, <response>, etc.
      .replace(/<[^>]+>/g, '')
      // Clean up extra whitespace but preserve intentional formatting
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Trim leading/trailing whitespace
      .trim();
  };

  // Format content for better display
  const formatContent = (content: string) => {
    if (isUser) {
      return content;
    }

    const cleaned = cleanContent(content);
    
    // Split into lines and process each line
    const lines = cleaned.split('\n').filter(line => line.trim()); // Remove empty lines
    const formattedElements = [];
    let currentListItems = [];
    let currentListType = null;
    
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      
      // Handle bullet points (*, -, •)
      if (trimmedLine.match(/^[\*\-•]\s/)) {
        if (currentListType !== 'bullet') {
          // Flush any existing list
          if (currentListItems.length > 0) {
            formattedElements.push(
              <div key={`list-${formattedElements.length}`} className="chat-list-container">
                {currentListItems}
              </div>
            );
            currentListItems = [];
          }
          currentListType = 'bullet';
        }
        currentListItems.push(
          <div key={`bullet-${i}`} className="chat-list-item">
            {trimmedLine.replace(/^[\*\-•]\s/, '')}
          </div>
        );
      }
      // Handle numbered lists
      else if (trimmedLine.match(/^\d+\.\s/)) {
        if (currentListType !== 'numbered') {
          // Flush any existing list
          if (currentListItems.length > 0) {
            formattedElements.push(
              <div key={`list-${formattedElements.length}`} className="chat-list-container">
                {currentListItems}
              </div>
            );
            currentListItems = [];
          }
          currentListType = 'numbered';
        }
        currentListItems.push(
          <div key={`numbered-${i}`} className="chat-numbered-item">
            {trimmedLine}
          </div>
        );
      }
      // Handle indented items (sub-bullets)
      else if (trimmedLine.match(/^\s{2,}[\*\-•]\s/)) {
        currentListItems.push(
          <div key={`sub-${i}`} className="chat-sub-item">
            {trimmedLine.replace(/^\s*[\*\-•]\s/, '')}
          </div>
        );
      }
      // Regular paragraphs
      else {
        // Flush any existing list first
        if (currentListItems.length > 0) {
          formattedElements.push(
            <div key={`list-${formattedElements.length}`} className="chat-list-container">
              {currentListItems}
            </div>
          );
          currentListItems = [];
          currentListType = null;
        }
        
        formattedElements.push(
          <div key={`paragraph-${i}`} className="chat-paragraph">
            {trimmedLine}
          </div>
        );
      }
    }
    
    // Flush any remaining list items
    if (currentListItems.length > 0) {
      formattedElements.push(
        <div key={`list-${formattedElements.length}`} className="chat-list-container">
          {currentListItems}
        </div>
      );
    }
    
    return formattedElements;
  };
  
  return (
    <div className={`chat-message ${isUser ? 'user' : isError ? 'error' : 'assistant'}`}>
      <div className="chat-message-content">
        <div className="chat-message-bubble">
          <div className="chat-formatted-content">
            {formatContent(message.content)}
          </div>
        </div>
        <div className="chat-message-timestamp">
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}