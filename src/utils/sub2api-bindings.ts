import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sub2ApiBindings } from '@/db/schema';

export function getSub2ApiBindingByUserId(userId: number) {
    return db.query.sub2ApiBindings.findFirst({
        where: eq(sub2ApiBindings.userId, userId)
    });
}

export function getSub2ApiBindingBySub2ApiUserId(sub2ApiUserId: number) {
    return db.query.sub2ApiBindings.findFirst({
        where: eq(sub2ApiBindings.sub2ApiUserId, sub2ApiUserId)
    });
}

export async function upsertSub2ApiBinding(userId: number, sub2ApiUserId: number): Promise<void> {
    const occupied = await getSub2ApiBindingBySub2ApiUserId(sub2ApiUserId);
    if (occupied && occupied.userId !== userId) {
        throw new Error(`Sub2API 用户 ${sub2ApiUserId} 已绑定到其他 QQ 用户。`);
    }

    await db
        .insert(sub2ApiBindings)
        .values({
            userId,
            sub2ApiUserId,
            updatedAt: Date.now()
        })
        .onConflictDoUpdate({
            target: sub2ApiBindings.userId,
            set: {
                sub2ApiUserId,
                updatedAt: Date.now()
            }
        });
}
