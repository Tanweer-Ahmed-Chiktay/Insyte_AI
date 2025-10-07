import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SlackProvider } from '@/lib/providers/slack-provider';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const refresh = searchParams.get('refresh') === 'true';

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get workspace
    const workspace = await prisma.slackWorkspace.findFirst({
      where: {
        userId: user.id,
        ...(workspaceId ? { id: workspaceId } : {}),
        isActive: true,
      },
      include: {
        channels: {
          orderBy: {
            name: 'asc',
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // If refresh is requested, sync channels from Slack
    if (refresh) {
      const slackProvider = new SlackProvider(workspace.accessToken, session.user.email);
      const channels = await slackProvider.getChannels();

      // Update channels in database
      for (const channel of channels) {
        await prisma.slackChannel.upsert({
          where: {
            workspaceId_channelId: {
              workspaceId: workspace.id,
              channelId: channel.id,
            },
          },
          update: {
            name: channel.name,
            isPrivate: channel.isPrivate,
            updatedAt: new Date(),
          },
          create: {
            workspaceId: workspace.id,
            channelId: channel.id,
            name: channel.name,
            isPrivate: channel.isPrivate,
          },
        });
      }

      // Get updated channels
      const updatedWorkspace = await prisma.slackWorkspace.findUnique({
        where: { id: workspace.id },
        include: {
          channels: {
            orderBy: {
              name: 'asc',
            },
          },
        },
      });

      return NextResponse.json({
        workspace: {
          id: updatedWorkspace!.id,
          teamId: updatedWorkspace!.teamId,
          teamName: updatedWorkspace!.teamName,
        },
        channels: updatedWorkspace!.channels,
      });
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        teamId: workspace.teamId,
        teamName: workspace.teamName,
      },
      channels: workspace.channels,
    });
  } catch (error) {
    console.error('Error fetching Slack channels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch channels' },
      { status: 500 }
    );
  }
}