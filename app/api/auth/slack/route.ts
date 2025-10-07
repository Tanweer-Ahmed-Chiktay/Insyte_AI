import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SlackProvider } from '@/lib/providers/slack-provider';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error) {
    console.error('Slack OAuth error:', error);
    return NextResponse.redirect(new URL('/?error=slack_auth_failed', request.url));
  }

  if (!code) {
    // Redirect to Slack OAuth
    const scopes = [
      'channels:read',
      'channels:history',
      'chat:write',
      'files:read',
      'files:write',
      'groups:read',
      'groups:history',
      'im:read',
      'im:history',
      'mpim:read',
      'mpim:history',
      'users:read',
      'team:read',
      'search:read'
    ].join(',');

    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', SLACK_CLIENT_ID);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', SLACK_REDIRECT_URI);
    authUrl.searchParams.set('state', state || 'default');

    return NextResponse.redirect(authUrl.toString());
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      console.error('Slack token exchange failed:', tokenData.error);
      return NextResponse.redirect(new URL('/?error=slack_token_failed', request.url));
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.redirect(new URL('/?error=not_authenticated', request.url));
    }

    // Test the connection
    const slackProvider = new SlackProvider(tokenData.access_token, session.user.email);
    const isConnected = await slackProvider.testConnection();

    if (!isConnected) {
      return NextResponse.redirect(new URL('/?error=slack_connection_failed', request.url));
    }

    // Get workspace info
    const workspaceInfo = await slackProvider.getWorkspaceInfo();

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.redirect(new URL('/?error=user_not_found', request.url));
    }

    // Store the Slack workspace and tokens in the database
    await prisma.slackWorkspace.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: workspaceInfo.id,
        },
      },
      update: {
        accessToken: tokenData.access_token,
        teamName: workspaceInfo.name,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        teamId: workspaceInfo.id,
        accessToken: tokenData.access_token,
        teamName: workspaceInfo.name,
      },
    });

    // Get the created workspace
    const workspace = await prisma.slackWorkspace.findUnique({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: workspaceInfo.id,
        },
      },
    });

    if (workspace) {
      // Sync initial channels
      const channels = await slackProvider.getChannels();
      for (const channel of channels.slice(0, 50)) { // Limit initial sync
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
    }

    return NextResponse.redirect(new URL('/?slack_connected=true', request.url));
  } catch (error) {
    console.error('Slack OAuth error:', error);
    return NextResponse.redirect(new URL('/?error=slack_auth_error', request.url));
  }
}