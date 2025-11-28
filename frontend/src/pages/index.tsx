import { Route, Routes } from 'react-router-dom';

import { Dashboard } from './dashboard';
import { Landing } from './landing';

const routes = [{ path: '/', Page:  Landing },{ path: '/dashboard', Page: Dashboard }];

function Routing() {
  const getRoutes = () => routes.map(({ path, Page }) => <Route key={path} path={path} element={<Page />} />);

  return <Routes>{getRoutes()}</Routes>;
}

export { Routing };
