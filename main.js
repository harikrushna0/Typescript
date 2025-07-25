import { formatUser } from './utils';

const user = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
};

const role = 'admin';

const formatted = formatUser(user, role);

console.log(formatted);
