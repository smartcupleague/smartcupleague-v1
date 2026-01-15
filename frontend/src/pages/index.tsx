import { Route, Routes } from 'react-router-dom';
import { Landing } from './landing';
import { Match } from './matchs';
import { Home } from './home';
import { AppLayout } from './AppLayout';
import { MatchesTableComponent } from '@/components/predictions/AllMatchs';
import { QueryBetsByUserComponent } from '@/components/predictions/QueryBetsByUser';
import Leaderboards from '@/components/leaderboard/Leaderboards';
import GovernancePanel from '@/components/dao/GovernancePanel';

function Routing() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/match/:id" element={<Match />} />
      <Route element={<AppLayout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/my-predictions" element={<QueryBetsByUserComponent />} />
        <Route path="/all-predictions" element={<MatchesTableComponent />} />
        <Route path="/leaderboards" element={<Leaderboards />} />
         <Route path="/dao" element={<GovernancePanel/>} />
        <Route path="/predictions/:wallet" element={<MatchesTableComponent />} />
      </Route>
    </Routes>
  );
}

export { Routing };
