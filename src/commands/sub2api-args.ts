import { isValidPositiveId, isValidUser, isValidVerificationCode } from '@/utils/validator';

export function validateSub2ApiArgs(args: string[]): boolean {
    if (args.length === 1 && args[0] === 'me') return true;
    if (args.length === 2 && args[0] === 'bind' && args[1] === 'query') return true;
    if (args.length === 2 && args[0] === 'bind') return isValidPositiveId(args[1]);
    if (args.length === 3 && args[0] === 'bind' && args[1] === 'query') return isValidUser(args[2]);
    if (args.length === 3 && args[0] === 'bind') return isValidPositiveId(args[1]) && isValidUser(args[2]);
    if (args.length === 2 && args[0] === 'verify') return isValidVerificationCode(args[1]);
    if (args.length === 2 && args[0] === 'user' && args[1] === 'query') return true;
    if (args.length === 3 && args[0] === 'user' && args[1] === 'query') return isValidUser(args[2]);
    if (args.length >= 3 && args[0] === 'user' && args[1] === 'search') {
        return args.slice(2).join(' ').trim().length > 0;
    }
    if (args.length === 2 && args[0] === 'group' && args[1] === 'list') return true;
    if (args.length === 3 && args[0] === 'group' && args[1] === 'models') return isValidPositiveId(args[2]);
    if (args.length === 2 && args[0] === 'package' && ['list', 'query'].includes(args[1])) return true;
    if (args.length === 3 && args[0] === 'package' && args[1] === 'query') return isValidUser(args[2]);
    if (args.length === 4 && args[0] === 'package' && args[1] === 'grant') {
        return isValidPositiveId(args[2]) && isValidUser(args[3]);
    }
    if (args.length === 3 && args[0] === 'package' && ['void', 'restore'].includes(args[1])) {
        return isValidPositiveId(args[2]);
    }
    if (args.length === 4 && args[0] === 'code' && args[1] === 'subscription') {
        return isValidPositiveId(args[2]) && isValidPositiveId(args[3]);
    }
    return false;
}
