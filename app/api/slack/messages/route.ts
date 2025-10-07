import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SlackProvider } from '@/lib/providers/slack-provider';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor');

    if (!channelId) {
      return NextResponse.json({ error: 'Channel ID is required' }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get channel and workspace
    const channel = await prisma.slackChannel.findFirst({
      where: {
        channelId,
        workspace: {
          userId: user.id,
          isActive: true,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Get messages from Slack
    const slackProvider = new SlackProvider(channel.workspace.accessToken, session.user.email);
    const result = await slackProvider.getMessages(channelId, limit, cursor || undefined);

    // Get users for message display
    const users = await slackProvider.getUsers();
    const userMap = new Map(users.map(user => [user.id, user]));

    // Enhance messages with user info
    const enhancedMessages = result.messages.map(message => ({
      ...message,
      userInfo: userMap.get(message.user),
    }));

    return NextResponse.json({
      messages: enhancedMessages,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      channel: {
        id: channel.channelId,
        name: channel.name,
        isPrivate: channel.isPrivate,
      },
    });
  } catch (error) {
    console.error('Error fetching Slack messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channelId, text } = await request.json();

    if (!channelId || !text) {
      return NextResponse.json(
        { error: 'Channel ID and text are required' },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get channel and workspace
    const channel = await prisma.slackChannel.findFirst({
      where: {
        channelId,
        workspace: {
          userId: user.id,
          isActive: true,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    // Send message via Slack
    const slackProvider = new SlackProvider(channel.workspace.accessToken, session.user.email);
    const messageId = await slackProvider.sendMessage(channelId, text);

    return NextResponse.json({
      success: true,
      messageId,
    });
  } catch (error) {
    console.error('Error sending Slack message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}