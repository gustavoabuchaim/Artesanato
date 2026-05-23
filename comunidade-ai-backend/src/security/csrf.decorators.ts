import { SetMetadata } from '@nestjs/common';
import { SKIP_CSRF_KEY } from './csrf.constants';

export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

