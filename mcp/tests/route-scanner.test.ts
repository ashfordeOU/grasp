import { scanRoutes } from '../src/route-scanner';

test('detects Express route definitions', () => {
  const files = {
    'src/routes.ts': `
      app.get('/users', listUsers);
      app.post('/users', createUser);
      router.delete('/users/:id', deleteUser);
    `,
  };
  const routes = scanRoutes(files);
  expect(routes).toHaveLength(3);
  expect(routes[0]).toMatchObject({ method: 'GET', path: '/users', handler: 'listUsers', file: 'src/routes.ts' });
  expect(routes[1]).toMatchObject({ method: 'POST', path: '/users', handler: 'createUser' });
});

test('detects FastAPI/Flask route definitions', () => {
  const files = {
    'app/routes.py': `
      @app.get("/items/{item_id}")
      def get_item(item_id: int):
          pass
      @router.post("/items")
      async def create_item():
          pass
    `,
  };
  const routes = scanRoutes(files);
  expect(routes.length).toBeGreaterThanOrEqual(2);
  expect(routes[0].method).toBe('GET');
  expect(routes[0].path).toBe('/items/{item_id}');
});
