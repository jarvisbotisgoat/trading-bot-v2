import { getServiceClient } from '../lib/supabase';
import type { BotLogLevel } from '../lib/types';

export async function log(
  level: BotLogLevel,
  message: string,
  metadata?: Record<string, unknown>
) {
  console.log(`[${level.toUpperCase()}] ${message}`, metadata || '');

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from('bot_log').insert({
      level,
      message,
      metadata: metadata || null,
    });
    if (error) {
      console.error('Failed to write bot_log:', error.message);
    }
  } catch (err) {
    console.error('Logger error:', err);
  }
}
