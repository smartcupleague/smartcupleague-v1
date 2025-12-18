import { useApi, useAccount } from '@gear-js/react-hooks';
import { Header, Footer, ApiLoader } from '@/components';
import { withProviders } from '@/hocs';
import { Routing } from '@/pages';

function Component() {
  const { isApiReady } = useApi();
  const { isAccountReady } = useAccount();

  const isAppReady = isApiReady && isAccountReady;

  return (
    <>
      <main>{isAppReady ? <Routing /> : <ApiLoader />}</main>
    </>
  );
}

export const App = withProviders(Component);
