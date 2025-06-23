import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  error?: boolean;
}

interface ChatInterfaceProps {
  onRefreshApiKey?: () => void;
}

export function ChatInterface({ onRefreshApiKey }: ChatInterfaceProps = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkApiKey();
    
    // Check API key status when the document becomes visible
    // This handles cases where settings are changed in another tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkApiKey();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const checkApiKey = async () => {
    try {
      const response = await fetch('/api/settings/api-key/status');
      const data = await response.json();
      setHasApiKey(data.hasApiKey);
    } catch (error) {
      console.error('Failed to check API key status:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      console.log('Sending chat message:', content);
      console.log('Messages being sent:', [...messages, userMessage]);
      
      // Clean messages to only include role and content for API
      const cleanMessages = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: cleanMessages })
      });

      console.log('Chat response status:', response.status);
      console.log('Chat response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Chat response error:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream completed');
            break;
          }

          const chunk = decoder.decode(value);
          console.log('Received chunk:', chunk);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') {
                console.log('Stream done marker received');
                continue;
              }
              
              try {
                const data = JSON.parse(dataStr);
                console.log('Parsed data:', data);
                
                if (data.error) {
                  console.error('Stream error:', data.error);
                  assistantMessage.content += `\n\nError: ${data.error}`;
                  assistantMessage.error = true;
                } else if (data.content) {
                  assistantMessage.content += data.content;
                }
                
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: assistantMessage.content, error: assistantMessage.error }
                      : msg
                  )
                );
              } catch (e) {
                console.error('Failed to parse SSE data:', dataStr, e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date(),
        error: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasApiKey) {
    return (
      <div className="chat-api-key-missing">
        <h2>API Key Required</h2>
        <p>
          To use the chat interface, please configure your API key in the settings.
        </p>
        <button
          onClick={() => {/* Settings will be accessible via header button */}}
          className="chat-api-key-button"
        >
          Use Settings Button Above
        </button>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="chat-messages-container">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <h3>Welcome to Fly.io Assistant</h3>
            <p>Ask me anything about your Fly.io infrastructure!</p>
          </div>
        )}
        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="chat-loading">
            <span>Thinking</span>
            <div className="chat-loading-dots">
              <div className="chat-loading-dot"></div>
              <div className="chat-loading-dot"></div>
              <div className="chat-loading-dot"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput onSendMessage={sendMessage} disabled={isLoading} />
    </div>
  );
}