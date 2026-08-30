import { and, eq, or } from 'drizzle-orm';
import { db } from '@/db';
import { commandBans } from '@/db/schema';
import { Command } from '@/types';

export type CommandBanContext = {
    userId: number;
    groupId: number | null;
    superUser: boolean;
};

type CommandBanTarget = Pick<Command<never>, 'name' | 'alwaysAvailable'>;

export function isCommandBanAllowed(command: CommandBanTarget): boolean {
    return command.alwaysAvailable !== true;
}

export async function checkCommandBan(
    context: CommandBanContext,
    command: CommandBanTarget,
    database: typeof db = db
): Promise<{ banned: boolean; reason?: string }> {
    if (context.superUser || !isCommandBanAllowed(command)) return { banned: false };

    const ban = await database.query.commandBans.findFirst({
        where: and(
            eq(commandBans.userId, context.userId),
            eq(commandBans.commandName, command.name),
            or(
                eq(commandBans.scopeType, 'global'),
                context.groupId !== null
                    ? and(eq(commandBans.scopeType, 'group'), eq(commandBans.scopeId, context.groupId))
                    : undefined
            )
        )
    });
    return ban ? { banned: true, reason: ban.reason ?? undefined } : { banned: false };
}
