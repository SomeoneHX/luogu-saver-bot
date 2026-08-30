const RESOLVED_TASK = Promise.resolve();

export class MessageEmbeddingCommitQueue {
    private readonly pendingByGroup = new Map<number, Promise<void>>();
    private readonly pendingByUser = new Map<number, Promise<void>>();

    enqueue<T>(
        groupId: number,
        userId: number,
        prepare: () => Promise<T>,
        commit: (value: T) => void | Promise<void>
    ): Promise<void> {
        let prepared: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>;
        try {
            prepared = prepare().then(
                value => ({ ok: true, value }),
                error => ({ ok: false, error })
            );
        } catch (error) {
            prepared = Promise.resolve({ ok: false, error });
        }

        const previousGroup = this.pendingByGroup.get(groupId) ?? RESOLVED_TASK;
        const previousUser = this.pendingByUser.get(userId) ?? RESOLVED_TASK;
        const task = Promise.all([previousGroup, previousUser, prepared]).then(([, , outcome]) => {
            if (!outcome.ok) throw outcome.error;
            return commit(outcome.value);
        });
        const gate = task.then(
            () => undefined,
            () => undefined
        );

        this.pendingByGroup.set(groupId, gate);
        this.pendingByUser.set(userId, gate);
        void gate.then(() => {
            if (this.pendingByGroup.get(groupId) === gate) this.pendingByGroup.delete(groupId);
            if (this.pendingByUser.get(userId) === gate) this.pendingByUser.delete(userId);
        });
        return task;
    }
}
