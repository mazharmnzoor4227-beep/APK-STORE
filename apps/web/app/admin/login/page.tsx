import { Header } from '../../../components/header';
import { LoginForm } from '../../../components/login-form';

export default function AdminLogin() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER ACCESS / SECURE</span><h1>Sign in<span className="green-dot">.</span></h1><p>Enter your owner email. We will send a sign-in link.</p><LoginForm /></main></>;
}
