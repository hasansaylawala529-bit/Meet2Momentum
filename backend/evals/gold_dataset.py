"""
Gold standard evaluation dataset for Meet2Momentum information extraction and classification benchmark.
Features 12 meeting transcripts modeled on AMI corpus, QMSum meeting structures, and engineering teams.
Each transcript includes hand-labeled ground-truth decisions, commitments, suggestions, and unresolved questions.
"""

GOLD_DATASET = [
    {
        "id": "eval_01_ami_industrial_design",
        "title": "AMI Project: Industrial Remote Design Kickoff",
        "date": "2026-10-15",
        "transcript": """Project Manager: Let's confirm design roles for the universal remote control.
Industrial Designer: I will produce three clay tactile mockups by next Tuesday.
User Interface Lead: Maybe we should consider using rubberized soft-touch plastic for the casing.
Project Manager: We agreed to keep the total bill of materials under fifteen dollars.
Marketing Lead: Who is going to benchmark competitive remotes from Sony and Philips?
Project Manager: That is still an open question. Let's decide in Thursday's sync.""",
        "gold_decisions": [
            {
                "title": "Keep total bill of materials under $15",
                "source_text": "We agreed to keep the total bill of materials under fifteen dollars."
            }
        ],
        "gold_action_items": [
            {
                "title": "Produce three clay tactile mockups",
                "category": "commitment",
                "owner": "Industrial Designer",
                "due_date": "next Tuesday",
                "source_text": "I will produce three clay tactile mockups by next Tuesday."
            },
            {
                "title": "Consider using rubberized soft-touch plastic for casing",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "Maybe we should consider using rubberized soft-touch plastic for the casing."
            },
            {
                "title": "Decide who will benchmark competitive remotes",
                "category": "unresolved_question",
                "owner": None,
                "due_date": "Thursday",
                "source_text": "Who is going to benchmark competitive remotes from Sony and Philips?"
            }
        ]
    },
    {
        "id": "eval_02_qmsum_academic_committee",
        "title": "QMSum Academic Curriculum Committee",
        "date": "2026-10-18",
        "transcript": """Chair: Moving to the graduate data science curriculum revision.
Professor Miller: I will draft the new syllabus for the machine learning core course by October 28.
Professor Vance: Perhaps we could introduce an ethics module into the first semester.
Chair: Confirmed decision: The introductory statistics prerequisite will be enforced starting Spring semester.
Professor Miller: What textbook are we adopting for the distributed systems elective?
Chair: The textbook selection committee has not yet finalized that recommendation.""",
        "gold_decisions": [
            {
                "title": "Enforce introductory statistics prerequisite starting Spring semester",
                "source_text": "The introductory statistics prerequisite will be enforced starting Spring semester."
            }
        ],
        "gold_action_items": [
            {
                "title": "Draft new syllabus for machine learning core course",
                "category": "commitment",
                "owner": "Professor Miller",
                "due_date": "October 28",
                "source_text": "I will draft the new syllabus for the machine learning core course by October 28."
            },
            {
                "title": "Introduce ethics module into first semester",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "Perhaps we could introduce an ethics module into the first semester."
            },
            {
                "title": "Determine textbook adoption for distributed systems elective",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "What textbook are we adopting for the distributed systems elective?"
            }
        ]
    },
    {
        "id": "eval_03_backend_api_migration",
        "title": "Backend Engineering Sprint Review",
        "date": "2026-10-20",
        "transcript": """Aman: I will finish the OAuth2 token refresh endpoint by Friday 5pm.
Riya: I can write the integration tests for the authentication service by Monday morning.
Vikram: We could evaluate GraphQL as an alternative to REST for mobile clients in Q1.
Neha: Agreed decision: We will deprecate legacy v1 API endpoints at the end of November.
Aman: Does staging have enough provisioned database IOPS for the load test?
Riya: We still need to confirm that with the infrastructure team.""",
        "gold_decisions": [
            {
                "title": "Deprecate legacy v1 API endpoints at end of November",
                "source_text": "We will deprecate legacy v1 API endpoints at the end of November."
            }
        ],
        "gold_action_items": [
            {
                "title": "Finish OAuth2 token refresh endpoint",
                "category": "commitment",
                "owner": "Aman",
                "due_date": "Friday 5pm",
                "source_text": "I will finish the OAuth2 token refresh endpoint by Friday 5pm."
            },
            {
                "title": "Write integration tests for authentication service",
                "category": "commitment",
                "owner": "Riya",
                "due_date": "Monday morning",
                "source_text": "I can write the integration tests for the authentication service by Monday morning."
            },
            {
                "title": "Evaluate GraphQL alternative for mobile clients in Q1",
                "category": "suggestion",
                "owner": None,
                "due_date": "Q1",
                "source_text": "We could evaluate GraphQL as an alternative to REST for mobile clients in Q1."
            },
            {
                "title": "Confirm database IOPS provisioning with infrastructure team",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Does staging have enough provisioned database IOPS for the load test?"
            }
        ]
    },
    {
        "id": "eval_04_security_incident_postmortem",
        "title": "Security Incident Triage & Postmortem",
        "date": "2026-10-21",
        "transcript": """Security Lead: Incident review for the expired SSL certificate on the payment webhook gateway.
DevOps Lead: I will rotate all wildcard staging certificates by Wednesday midnight.
Security Lead: Decision reached: Mandate automated 30-day renewal alerts via PagerDuty.
Compliance Officer: We should probably conduct a third-party penetration test before the annual audit.
Engineering Manager: Who will audit the egress firewall rules for the payment gateway?
Security Lead: We still need an assignee for the egress firewall audit.""",
        "gold_decisions": [
            {
                "title": "Mandate automated 30-day renewal alerts via PagerDuty",
                "source_text": "Mandate automated 30-day renewal alerts via PagerDuty."
            }
        ],
        "gold_action_items": [
            {
                "title": "Rotate all wildcard staging certificates",
                "category": "commitment",
                "owner": "DevOps Lead",
                "due_date": "Wednesday midnight",
                "source_text": "I will rotate all wildcard staging certificates by Wednesday midnight."
            },
            {
                "title": "Conduct third-party penetration test before annual audit",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "We should probably conduct a third-party penetration test before the annual audit."
            },
            {
                "title": "Audit egress firewall rules for payment gateway",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Who will audit the egress firewall rules for the payment gateway?"
            }
        ]
    },
    {
        "id": "eval_05_mobile_app_redesign",
        "title": "Mobile App UI/UX Redesign",
        "date": "2026-10-22",
        "transcript": """Design Lead: Review of the redesigned onboarding funnel.
Product Designer: I will finalize the Figma component library for iOS by Friday.
Frontend Lead: It might be worth exploring React Native Web to share code with the desktop app.
Product Manager: Confirmed decision: The bottom navigation bar will adopt four tabs instead of five.
Product Designer: Are we supporting dynamic type sizing on Android in release 2.0?
Engineering Lead: That remains unresolved until we check backwards compatibility on Android 11.""",
        "gold_decisions": [
            {
                "title": "Adopt four tabs on bottom navigation bar instead of five",
                "source_text": "The bottom navigation bar will adopt four tabs instead of five."
            }
        ],
        "gold_action_items": [
            {
                "title": "Finalize Figma component library for iOS",
                "category": "commitment",
                "owner": "Product Designer",
                "due_date": "Friday",
                "source_text": "I will finalize the Figma component library for iOS by Friday."
            },
            {
                "title": "Explore React Native Web for code sharing",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "It might be worth exploring React Native Web to share code with the desktop app."
            },
            {
                "title": "Verify dynamic type sizing support on Android 11",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Are we supporting dynamic type sizing on Android in release 2.0?"
            }
        ]
    },
    {
        "id": "eval_06_data_pipeline_scalability",
        "title": "Data Platform Architecture Sync",
        "date": "2026-10-23",
        "transcript": """Data Architect: Ingestion throughput reached 40,000 events per second.
Data Engineer: I will migrate the clickstream consumer group to Apache Flink by October 30.
Staff Engineer: We could consider switching from JSON serialization to Avro on Kafka topics.
Data Architect: Decision: All analytics warehouse tables must partition by ingestion_date and country.
Data Engineer: Has finance approved the cloud budget increase for the dedicated Flink cluster?
Data Architect: Finance approval is pending until the quarterly review.""",
        "gold_decisions": [
            {
                "title": "Partition all analytics warehouse tables by ingestion_date and country",
                "source_text": "All analytics warehouse tables must partition by ingestion_date and country."
            }
        ],
        "gold_action_items": [
            {
                "title": "Migrate clickstream consumer group to Apache Flink",
                "category": "commitment",
                "owner": "Data Engineer",
                "due_date": "October 30",
                "source_text": "I will migrate the clickstream consumer group to Apache Flink by October 30."
            },
            {
                "title": "Consider switching from JSON to Avro on Kafka topics",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "We could consider switching from JSON serialization to Avro on Kafka topics."
            },
            {
                "title": "Obtain finance approval for Flink cloud budget increase",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Has finance approved the cloud budget increase for the dedicated Flink cluster?"
            }
        ]
    },
    {
        "id": "eval_07_customer_success_handoff",
        "title": "Customer Success & Operations Alignment",
        "date": "2026-10-24",
        "transcript": """CS Lead: Enterprise onboarding for Acme Corp begins next month.
Support Specialist: I will prepare the customized SSO configuration guide by Tuesday noon.
CS Lead: Maybe we should offer weekend onboarding coverage during Acme's go-live.
Product Manager: Confirmed decision: Standard support tier will include a 4-hour response SLA.
Support Specialist: Who is the designated technical escalation contact during Acme's launch?
CS Lead: We still need an engineering manager on-call for that weekend.""",
        "gold_decisions": [
            {
                "title": "Include 4-hour response SLA in standard support tier",
                "source_text": "Standard support tier will include a 4-hour response SLA."
            }
        ],
        "gold_action_items": [
            {
                "title": "Prepare customized SSO configuration guide",
                "category": "commitment",
                "owner": "Support Specialist",
                "due_date": "Tuesday noon",
                "source_text": "I will prepare the customized SSO configuration guide by Tuesday noon."
            },
            {
                "title": "Offer weekend onboarding coverage during go-live",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "Maybe we should offer weekend onboarding coverage during Acme's go-live."
            },
            {
                "title": "Designate engineering technical escalation contact for launch",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Who is the designated technical escalation contact during Acme's launch?"
            }
        ]
    },
    {
        "id": "eval_08_devrel_hackathon_planning",
        "title": "DevRel Community Hackathon Planning",
        "date": "2026-10-25",
        "transcript": """Community Lead: Planning the developer hackathon next month.
Developer Advocate: I will deploy the starter boilerplate repository on GitHub by Wednesday.
Community Lead: We could potentially invite guest judges from the open-source committee.
Program Manager: Decision agreed: Prize pool will be capped at five thousand dollars in cloud credits.
Developer Advocate: Do we have sandbox API keys ready for 200 participants?
Community Lead: Sandbox API key quota is not yet approved by operations.""",
        "gold_decisions": [
            {
                "title": "Cap prize pool at $5,000 in cloud credits",
                "source_text": "Prize pool will be capped at five thousand dollars in cloud credits."
            }
        ],
        "gold_action_items": [
            {
                "title": "Deploy starter boilerplate repository on GitHub",
                "category": "commitment",
                "owner": "Developer Advocate",
                "due_date": "Wednesday",
                "source_text": "I will deploy the starter boilerplate repository on GitHub by Wednesday."
            },
            {
                "title": "Invite guest judges from open-source committee",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "We could potentially invite guest judges from the open-source committee."
            },
            {
                "title": "Prepare sandbox API keys for 200 participants",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Do we have sandbox API keys ready for 200 participants?"
            }
        ]
    },
    {
        "id": "eval_09_qa_automation_strategy",
        "title": "QA Test Automation & Release Health",
        "date": "2026-10-26",
        "transcript": """QA Lead: E2E test suite takes 45 minutes on CI runners.
Automation Engineer: I will implement test sharding across four parallel containers by Thursday.
SDET: Perhaps we should convert Cypress tests to Playwright to reduce flakiness.
QA Lead: Decision: No pull request can be merged if test coverage drops below 80%.
Automation Engineer: Which team owns maintenance of the synthetic test user seed data?
QA Lead: That responsibility is unassigned right now.""",
        "gold_decisions": [
            {
                "title": "Block PR merges if test coverage drops below 80%",
                "source_text": "No pull request can be merged if test coverage drops below 80%."
            }
        ],
        "gold_action_items": [
            {
                "title": "Implement test sharding across four parallel containers",
                "category": "commitment",
                "owner": "Automation Engineer",
                "due_date": "Thursday",
                "source_text": "I will implement test sharding across four parallel containers by Thursday."
            },
            {
                "title": "Convert Cypress tests to Playwright to reduce flakiness",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "Perhaps we should convert Cypress tests to Playwright to reduce flakiness."
            },
            {
                "title": "Assign ownership of synthetic test user seed data",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Which team owns maintenance of the synthetic test user seed data?"
            }
        ]
    },
    {
        "id": "eval_10_infra_cost_optimization",
        "title": "FinOps & Cloud Cost Optimization",
        "date": "2026-10-27",
        "transcript": """FinOps Analyst: Cloud spend exceeded budget by 18% last month.
Site Reliability Engineer: I will configure automated shutdown of idle development clusters by Friday 6pm.
FinOps Analyst: We could review 1-year and 3-year Compute Savings Plans next quarter.
VP of Engineering: Decision confirmed: All non-production environments must use spot instances.
Site Reliability Engineer: Has security vetted the auto-cleanup script for orphaned EBS volumes?
FinOps Analyst: Security review is still pending.""",
        "gold_decisions": [
            {
                "title": "Mandate spot instances for all non-production environments",
                "source_text": "All non-production environments must use spot instances."
            }
        ],
        "gold_action_items": [
            {
                "title": "Configure automated shutdown of idle development clusters",
                "category": "commitment",
                "owner": "Site Reliability Engineer",
                "due_date": "Friday 6pm",
                "source_text": "I will configure automated shutdown of idle development clusters by Friday 6pm."
            },
            {
                "title": "Review 1-year and 3-year Compute Savings Plans next quarter",
                "category": "suggestion",
                "owner": None,
                "due_date": "next quarter",
                "source_text": "We could review 1-year and 3-year Compute Savings Plans next quarter."
            },
            {
                "title": "Verify security approval for EBS auto-cleanup script",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Has security vetted the auto-cleanup script for orphaned EBS volumes?"
            }
        ]
    },
    {
        "id": "eval_11_hr_remote_policy",
        "title": "People Ops & Hybrid Work Policy Review",
        "date": "2026-10-28",
        "transcript": """People Partner: Discussion regarding 2027 international remote work stipend.
Operations Specialist: I will distribute the ergonomic equipment reimbursement survey by Monday.
People Partner: We could consider providing co-working space passes in secondary cities.
Director of HR: Confirmed decision: Home office internet stipends will increase to $75 monthly.
Operations Specialist: What is the tax compliance procedure for employees working abroad over 90 days?
Director of HR: Legal and tax counsel have not delivered that memorandum yet.""",
        "gold_decisions": [
            {
                "title": "Increase home office internet stipends to $75 monthly",
                "source_text": "Home office internet stipends will increase to $75 monthly."
            }
        ],
        "gold_action_items": [
            {
                "title": "Distribute ergonomic equipment reimbursement survey",
                "category": "commitment",
                "owner": "Operations Specialist",
                "due_date": "Monday",
                "source_text": "I will distribute the ergonomic equipment reimbursement survey by Monday."
            },
            {
                "title": "Provide co-working space passes in secondary cities",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "We could consider providing co-working space passes in secondary cities."
            },
            {
                "title": "Clarify international tax compliance for remote work over 90 days",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "What is the tax compliance procedure for employees working abroad over 90 days?"
            }
        ]
    },
    {
        "id": "eval_12_product_pricing_packaging",
        "title": "Product Growth & Tier Packaging",
        "date": "2026-10-29",
        "transcript": """Growth Lead: Evaluating conversion rate on the self-serve checkout funnel.
Product Manager: I will complete the competitive pricing comparison matrix by Wednesday 3pm.
Growth Lead: We might want to experiment with a 14-day free trial without credit card requirement.
VP of Product: Decision: The Starter tier will be capped at 5 team seats.
Product Manager: Does our payment processor support localized European payment methods like iDEAL?
Growth Lead: Billing engineering is currently investigating payment gateway support.""",
        "gold_decisions": [
            {
                "title": "Cap Starter tier at 5 team seats",
                "source_text": "The Starter tier will be capped at 5 team seats."
            }
        ],
        "gold_action_items": [
            {
                "title": "Complete competitive pricing comparison matrix",
                "category": "commitment",
                "owner": "Product Manager",
                "due_date": "Wednesday 3pm",
                "source_text": "I will complete the competitive pricing comparison matrix by Wednesday 3pm."
            },
            {
                "title": "Experiment with 14-day trial without credit card",
                "category": "suggestion",
                "owner": None,
                "due_date": None,
                "source_text": "We might want to experiment with a 14-day free trial without credit card requirement."
            },
            {
                "title": "Confirm payment gateway support for European methods",
                "category": "unresolved_question",
                "owner": None,
                "due_date": None,
                "source_text": "Does our payment processor support localized European payment methods like iDEAL?"
            }
        ]
    }
]
