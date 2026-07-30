"""
schedule_reader.py
Reads applicant availability data and returns it in a structured form
for other agents (like a future matching/ranking agent) to use.
"""
import csv
from agents.base_agent import BaseAgent

class ScheduleReaderAgent(BaseAgent):
    def run(self, task: str) -> str:
        # 'task' here is expected to be a file path to the schedule data,
        # e.g. "data/applicants.csv"
        applicants = []
        with open(task, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                applicants.append(row)
        return str(applicants)
