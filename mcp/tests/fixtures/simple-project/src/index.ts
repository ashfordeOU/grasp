import { greet } from './utils';
import { UserService } from './services/user';

const service = new UserService();
console.log(greet('world'));
export { service };
