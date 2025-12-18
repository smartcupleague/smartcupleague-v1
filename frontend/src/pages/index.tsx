import { Route, Routes } from 'react-router-dom';

import { Dashboard } from './dashboard';
import { Landing } from './landing';
import { Match } from './matchs';

const routes = [{ path: '/', Page:  Landing },{ path: '/dashboard', Page: Dashboard }, { path: '/match/:id', Page: Match }];

function Routing() {
  const getRoutes = () => routes.map(({ path, Page }) => <Route key={path} path={path} element={<Page />} />);

  return <Routes>{getRoutes()}</Routes>;
}

export { Routing };
