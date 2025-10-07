'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { createCSRFHeaders } from '@/lib/utils/csrf-client';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MessageCircle, 
  Hash, 
  Lock, 
  Send, 
  RefreshCw, 
  Users,
  Settings,
  Plus
} from 'lucide-react';

interface SlackChannel {
  id: string;
  channelId: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

interface SlackMessage {
  id: string;
  text: string;
  user: string;
  username?: string;
  timestamp: Date;
  userInfo?: {
    id: string;
    name: string;
    realName?: string;
    avatar?: string;
  };
}

interface SlackWorkspace {
  id: string;
  teamId: string;
  teamName: string;
}

export function SlackTab() {
  const [workspace, setWorkspace] = useState<SlackWorkspace | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [refreshingChannels, setRefreshingChannels] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async (refresh = false) => {
    try {
      if (refresh) setRefreshingChannels(true);
      
      const response = await fetch(`/api/slack/channels${refresh ? '?refresh=true' : ''}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          // No Slack workspace connected
          setLoading(false);
          return;
        }
        throw new Error('Failed to load channels');
      }

      const data = await response.json();
      setWorkspace(data.workspace);
      setChannels(data.channels);
      
      // Select first channel if none selected
      if (!selectedChannel && data.channels.length > 0) {
        setSelectedChannel(data.channels[0]);
      }
    } catch (error) {
      console.error('Error loading channels:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Slack channels',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshingChannels(false);
    }
  };

  const loadMessages = async (channel: SlackChannel) => {
    try {
      const response = await fetch(`/api/slack/messages?channelId=${channel.channelId}&limit=50`);
      
      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const data = await response.json();
      setMessages(data.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })));
    } catch (error) {
      console.error('Error loading messages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive',
      });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChannel || sendingMessage) return;

    setSendingMessage(true);
    try {
      const headers = await createCSRFHeaders();
      const response = await fetch('/api/slack/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channelId: selectedChannel.channelId,
          text: newMessage,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setNewMessage('');
      // Reload messages to show the new message
      await loadMessages(selectedChannel);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleChannelSelect = (channel: SlackChannel) => {
    setSelectedChannel(channel);
    loadMessages(channel);
  };

  const connectSlack = () => {
    window.location.href = '/api/auth/slack';
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex h-full">
        <div className="w-64 border-r bg-gray-50 p-4">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <MessageCircle className="h-6 w-6" />
              Connect Slack
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              Connect your Slack workspace to view and send messages directly from InSyte.
            </p>
            <Button onClick={connectSlack} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Connect Slack Workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r bg-gray-50 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">{workspace.teamName}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadChannels(true)}
              disabled={refreshingChannels}
            >
              <RefreshCw className={`h-4 w-4 ${refreshingChannels ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleChannelSelect(channel)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-gray-200 transition-colors ${
                  selectedChannel?.id === channel.id ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                }`}
              >
                {channel.isPrivate ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Hash className="h-4 w-4" />
                )}
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {selectedChannel ? (
          <>
            {/* Header */}
            <div className="border-b p-4">
              <div className="flex items-center gap-2">
                {selectedChannel.isPrivate ? (
                  <Lock className="h-5 w-5" />
                ) : (
                  <Hash className="h-5 w-5" />
                )}
                <h2 className="font-semibold">{selectedChannel.name}</h2>
                {selectedChannel.isPrivate && (
                  <Badge variant="secondary">Private</Badge>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    {message.userInfo?.avatar ? (
                      <Image src={message.userInfo.avatar} alt={message.userInfo.name || 'User avatar'} width={32} height={32} className="rounded-full object-cover" />
                    ) : (
                      <div className="bg-blue-500 text-white text-xs font-medium flex items-center justify-center h-full">
                        {(message.userInfo?.name || message.username || 'U')[0].toUpperCase()}
                      </div>
                    )}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {message.userInfo?.realName || message.userInfo?.name || message.username || 'Unknown User'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap">
                      {message.text}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={`Message #${selectedChannel.name}`}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sendingMessage}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sendingMessage}
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a channel to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}