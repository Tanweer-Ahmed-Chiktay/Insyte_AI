import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

import { syncCoordinator } from '@/lib/sync-coordinator';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      force = false, 
      background = false, 
      minimal = false,
      category = 'inbox',
      priority = 'medium'
    } = await req.json().catch(() => ({}));

    console.log(`Received sync request for category: ${category} with priority: ${priority}`);

    const syncResult = await syncCoordinator.requestSync({
      category,
      priority,
      force,
      background,
      minimal,
    });

    return NextResponse.json(syncResult);

  } catch (error) {
    console.error('API Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate sync', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Get sync status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const syncStatus = syncCoordinator.getSyncStatus('inbox');
    const stats = syncCoordinator.getStats();
    const isAnySyncActive = syncCoordinator.isAnySyncInProgress();

    return NextResponse.json({
      isAnySyncActive,
      syncStatus,
      stats,
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Get sync status error:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}