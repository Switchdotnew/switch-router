# Security Policy

## 🛡️ Supported Versions

We actively support the following versions of LLM Router with security updates:

| Version | Supported              |
| ------- | ---------------------- |
| 1.x.x   | ✅ Active support      |
| < 1.0   | ❌ No longer supported |

## 🚨 Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow responsible disclosure:

### ⚡ Critical Vulnerabilities

For **critical security issues** that could be actively exploited:

1. **DO NOT** create a public GitHub issue
2. **Email us immediately** at [security@switch.new](mailto:security@switch.new)
3. Include "SECURITY VULNERABILITY" in the subject line
4. Provide detailed information (see template below)

### 📋 Security Report Template

```
Subject: SECURITY VULNERABILITY - [Brief Description]

## Vulnerability Details
- **Type**: [e.g., Authentication bypass, Code injection, etc.]
- **Severity**: [Critical/High/Medium/Low]
- **Affected Component**: [e.g., API authentication, Model routing, etc.]
- **Affected Versions**: [e.g., v1.0.0 - v1.2.1]

## Description
[Detailed description of the vulnerability]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Impact
[What could an attacker accomplish?]

## Proof of Concept
[Code samples, screenshots, or logs demonstrating the issue]

## Suggested Fix
[If you have ideas for how to fix it]

## Reporter Information
- Name: [Your name]
- Contact: [Your email]
- Organisation: [Optional]
```

### 🔄 Response Process

1. **Acknowledgment**: We'll acknowledge receipt within **24 hours**
2. **Initial Assessment**: We'll provide an initial assessment within **72 hours**
3. **Investigation**: We'll investigate and develop a fix
4. **Coordination**: We'll coordinate the disclosure timeline with you
5. **Release**: We'll release a security update and public advisory
6. **Recognition**: We'll publicly thank you (if desired) after the fix is released

## 🏆 Security Recognition

We believe in recognising security researchers who help keep our users safe:

- **Hall of Fame**: Public recognition on our security page
- **CVE Credit**: Proper attribution in CVE entries
- **Swag**: Vepler security researcher merchandise
- **Bounty Programme**: Contact us for details on our bug bounty programme

## 🔒 Security Best Practices

### For Users

#### Authentication

- **Use strong API keys**: Generate cryptographically secure random keys
- **Rotate keys regularly**: Change API keys periodically
- **Restrict key access**: Limit API key permissions to minimum required
- **Monitor usage**: Track API key usage for anomalies

#### Network Security

- **Use HTTPS**: Always use TLS/SSL in production
- **Firewall configuration**: Restrict network access to necessary ports
- **Rate limiting**: Implement rate limiting at the load balancer level
- **IP allowlisting**: Restrict API access to known IP ranges

#### Environment Security

- **Environment variables**: Never commit secrets to version control
- **Use secret management**: Employ tools like Doppler, AWS Secrets Manager
- **Container security**: Use minimal base images and scan for vulnerabilities
- **Regular updates**: Keep dependencies and runtime updated

#### Configuration Security

- **Never commit real configuration files**: Use `definitions.example.json` templates only
- **Use environment variables for secrets**: Reference secrets via environment variables
- **Separate development/production configs**: Use different credential stores for each environment
- **Validate configuration**: Use the provided JSON schema to validate your configuration

#### Monitoring & Logging

- **Enable logging**: Use structured logging for security events
- **Monitor for anomalies**: Set up alerts for unusual patterns
- **Audit trails**: Maintain logs of API access and configuration changes
- **Incident response**: Have a plan for security incidents

### For Developers

#### Code Security

- **Input validation**: Validate all user inputs with Zod schemas
- **Output encoding**: Properly encode outputs to prevent injection
- **Authentication checks**: Verify authentication on all protected endpoints
- **Error handling**: Don't leak sensitive information in error messages

#### Dependency Management

- **Regular audits**: Run `bun audit` regularly
- **Update dependencies**: Keep dependencies updated
- **Vulnerability scanning**: Use automated scanning tools
- **Pin versions**: Use exact version pinning for reproducible builds

#### Development Security

- **Pre-commit hooks**: Install and use the provided `.pre-commit-config.yaml`
- **Secret scanning**: Never commit API keys, certificates, or credentials
- **Code review**: All changes should be reviewed for security implications
- **Testing**: Include security tests in your test suite

#### Files That Should NEVER Be Committed

- `definitions.json` (real configuration)
- `.env` files (except `.env.example`)
- `*.key`, `*.pem` (certificates and private keys)
- Any file containing real API keys or secrets
- Production configuration files
- Database dumps or backups containing real data

#### Safe Files to Commit

- `definitions.example.json` (template configurations)
- `.env.example` (template environment files)
- `k8s/secret.yaml` (Kubernetes secret template with empty values)
- Documentation with placeholder examples
- Test configurations with dummy/mock data

## 🔍 Security Features

### Built-in Security

- **API Key Authentication**: Multi-key support with secure validation
- **Input Validation**: Comprehensive request validation with Zod
- **Rate Limiting**: Configurable rate limiting and throttling
- **CORS Protection**: Configurable cross-origin resource sharing
- **Error Sanitisation**: Secure error handling without information disclosure
- **Dependency Scanning**: Automated vulnerability scanning in CI/CD

### Security Headers

The application automatically sets secure HTTP headers:

```typescript
// Security headers automatically applied
{
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin"
}
```

## 🚀 Security Updates

### Receiving Updates

- **Watch this repository** to receive notifications
- **Subscribe to releases** for security announcements
- **Follow [@VeplerSecurity](https://twitter.com/VeplerSecurity)** for updates
- **Join our security mailing list**: [security-announce@switch.new](mailto:security-announce@switch.new)

### Update Process

1. **Security patches** are released as patch versions (1.0.x)
2. **Critical fixes** may be backported to older supported versions
3. **Breaking changes** are avoided in security releases when possible
4. **Migration guides** are provided for necessary breaking changes

## 📞 Contact Information

- **Security Team**: [security@switch.new](mailto:security@switch.new)
- **General Support**: [support@switch.new](mailto:support@switch.new)
- **PGP Key**: Available at [keybase.io/vepler](https://keybase.io/vepler)

## 🏅 Security Hall of Fame

We thank the following security researchers for their responsible disclosure:

_[No vulnerabilities reported yet - you could be first!]_

---

**Remember**: When in doubt, err on the side of caution and report it. We'd rather investigate a false positive than miss a real vulnerability.
